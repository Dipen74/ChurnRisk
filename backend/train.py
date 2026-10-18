import os
import joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score

# 1. Load the data
df = pd.read_csv("data/customer_churn_dataset-testing-master.csv")
df = df.dropna()
print("Rows, columns:", df.shape)

# 2. Prepare the data
X = pd.get_dummies(df.drop(columns=["CustomerID", "Churn"]), drop_first=True)
y = df["Churn"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 3. Train the model
model = DecisionTreeClassifier(max_depth=5, random_state=42)
model.fit(X_train, y_train)

# 4. Check how good it is
pred = model.predict(X_test)
print("Accuracy: {:.1%}".format(accuracy_score(y_test, pred)))

# 5. Save the model so the app can use it later
os.makedirs("model", exist_ok=True)
joblib.dump({"model": model, "columns": list(X.columns)}, "model/churn_model.joblib")
print("Model saved!")