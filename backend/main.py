import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allows the website (frontend) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the saved model once, when the API starts
bundle = joblib.load("model/churn_model.joblib")
model = bundle["model"]
columns = bundle["columns"]


# The information we expect for each customer
class Customer(BaseModel):
    age: int
    gender: str
    tenure: int
    usage_frequency: int
    support_calls: int
    payment_delay: int
    subscription_type: str
    contract_length: str
    total_spend: float
    last_interaction: int


@app.get("/")
def home():
    return {"message": "Churn API is running"}


@app.post("/predict")
def predict(c: Customer):
    # 1. Put the inputs in a one-row table
    customer = pd.DataFrame([{
        "Age": c.age,
        "Gender": c.gender,
        "Tenure": c.tenure,
        "Usage Frequency": c.usage_frequency,
        "Support Calls": c.support_calls,
        "Payment Delay": c.payment_delay,
        "Subscription Type": c.subscription_type,
        "Contract Length": c.contract_length,
        "Total Spend": c.total_spend,
        "Last Interaction": c.last_interaction,
    }])

    # 2. Encode text the same way as training
    customer = pd.get_dummies(customer).reindex(columns=columns, fill_value=0)

    # 3. Churn probability and risk level
    prob = float(model.predict_proba(customer)[0][1])
    level = "LOW" if prob < 0.30 else "MEDIUM" if prob < 0.70 else "HIGH"

    # 4. Explain which rules this customer passed through
    tree = model.tree_
    reasons = []
    for node in model.decision_path(customer).indices[:-1]:
        feature = columns[tree.feature[node]]
        value = float(customer.iloc[0][feature])
        sign = "<=" if value <= tree.threshold[node] else ">"
        reasons.append(f"{feature} = {value:g} ({sign} {tree.threshold[node]:.1f})")

    return {
        "probability": round(prob, 3),
        "risk_level": level,
        "reasons": reasons,
    }