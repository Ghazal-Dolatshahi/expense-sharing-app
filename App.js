import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import "./App.css";

const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      axios
        .get("/api/users")
        .then((response) => {
          const currentUser = response.data.find(
            (u) => u.username === JSON.parse(atob(token.split(".")[1])).username
          );
          setUser(currentUser);
        })
        .catch(() => {
          localStorage.removeItem("token");
          delete axios.defaults.headers.common["Authorization"];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (userData, token) => {
    localStorage.setItem("token", token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
};

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post("/api/login", { username, password });
      login(response.data.user, response.data.token);
    } catch (err) {
      setError(
        err.response?.data?.message || "An error occurred during login"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <p>
          Don't have an account? <a href="/register">Register</a>
        </p>
      </div>
    </div>
  );
};

const Register = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post("/api/register", {
        username,
        email,
        password,
      });
      login(response.data.user, response.data.token);
    } catch (err) {
      setError(
        err.response?.data?.message || "An error occurred during registration"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Register</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>
        <p>
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("expenses");
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ expensesByCategory: [], monthlyExpenses: [] });
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [expensesRes, balancesRes, usersRes, statsRes] = await Promise.all([
          axios.get("/api/expenses"),
          axios.get("/api/balance"),
          axios.get("/api/users"),
          axios.get("/api/stats"),
        ]);

        setExpenses(expensesRes.data);
        setBalances(balancesRes.data);
        setUsers(usersRes.data);
        setStats(statsRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Expense Sharing</h1>
          <div className="user-info">
            <span>{user?.username}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="dashboard-tabs">
        <button
          className={`tab ${activeTab === "expenses" ? "active" : ""}`}
          onClick={() => setActiveTab("expenses")}
        >
          Expenses
        </button>
        <button
          className={`tab ${activeTab === "balance" ? "active" : ""}`}
          onClick={() => setActiveTab("balance")}
        >
          Balance
        </button>
        <button
          className={`tab ${activeTab === "add" ? "active" : ""}`}
          onClick={() => setActiveTab("add")}
        >
          Add Expense
        </button>
        <button
          className={`tab ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => setActiveTab("stats")}
        >
          Statistics
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === "expenses" && (
          <div className="expenses-container">
            <h2>Recent Expenses</h2>
            {expenses.length === 0 ? (
              <p>No expenses yet. Add your first expense!</p>
            ) : (
              <div className="expenses-list">
                {expenses.map((expense) => (
                  <div key={expense._id} className="expense-item">
                    <div className="expense-header">
                      <h3>{expense.description}</h3>
                      <span className="expense-amount">${expense.amount}</span>
                    </div>
                    <div className="expense-details">
                      <p>Category: {expense.category}</p>
                      <p>
                        Paid by: {expense.paidBy.username}
                      </p>
                      <p>
                        Participants:{" "}
                        {expense.participants.map((p) => p.username).join(", ")}
                      </p>
                      <p>Date: {new Date(expense.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "balance" && (
          <div className="balance-container">
            <h2>Your Balance</h2>
            {balances.length === 0 ? (
              <p>You're all settled up!</p>
            ) : (
              <div className="balance-list">
                {balances.map((balance, index) => (
                  <div key={index} className="balance-item">
                    <div className="balance-info">
                      <h3>
                        {balance.owes ? "You owe" : "You are owed"}{" "}
                        {balance.user.username}
                      </h3>
                      <span className={`balance-amount ${balance.owes ? "negative" : "positive"}`}>
                        ${balance.amount}
                      </span>
                    </div>
                    {balance.owes && (
                      <PaymentButton
                        toUserId={balance.user._id}
                        amount={balance.amount}
                        username={balance.user.username}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "add" && (
          <AddExpenseForm users={users} onExpenseAdded={() => {
            axios.get("/api/expenses").then((res) => setExpenses(res.data));
          }} />
        )}

        {activeTab === "stats" && (
          <div className="stats-container">
            <h2>Expense Statistics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Expenses by Category</h3>
                {stats.expensesByCategory.length === 0 ? (
                  <p>No data available</p>
                ) : (
                  <div className="chart-container">
                    {stats.expensesByCategory.map((category, index) => (
                      <div key={index} className="chart-item">
                        <div className="chart-label">{category._id}</div>
                        <div className="chart-bar">
                          <div
                            className="chart-fill"
                            style={{
                              width: `${(category.total / Math.max(...stats.expensesByCategory.map(c => c.total))) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <div className="chart-value">${category.total}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stat-card">
                <h3>Monthly Expenses</h3>
                {stats.monthlyExpenses.length === 0 ? (
                  <p>No data available</p>
                ) : (
                  <div className="chart-container">
                    {stats.monthlyExpenses.map((month, index) => (
                      <div key={index} className="chart-item">
                        <div className="chart-label">
                          {new Date(month._id.year, month._id.month - 1).toLocaleDateString("en", {
                            year: "numeric",
                            month: "short",
                          })}
                        </div>
                        <div className="chart-bar">
                          <div
                            className="chart-fill"
                            style={{
                              width: `${(month.total / Math.max(...stats.monthlyExpenses.map(m => m.total))) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <div className="chart-value">${month.total}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AddExpenseForm = ({ users, onExpenseAdded }) => {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [participants, setParticipants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get("/api/categories")
      .then((res) => setCategories(res.data))
      .catch((err) => console.error("Error fetching categories:", err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!description || !amount || !category || !paidBy || participants.length === 0) {
      setError("Please fill all fields");
      setLoading(false);
      return;
    }

    try {
      await axios.post("/api/expenses", {
        description,
        amount: parseFloat(amount),
        category,
        paidBy,
        participants,
      });

      setDescription("");
      setAmount("");
      setCategory("");
      setPaidBy("");
      setParticipants([]);

      onExpenseAdded();
    } catch (err) {
      setError(
        err.response?.data?.message || "An error occurred while adding the expense"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleParticipantToggle = (userId) => {
    if (participants.includes(userId)) {
      setParticipants(participants.filter((id) => id !== userId));
    } else {
      setParticipants([...participants, userId]);
    }
  };

  return (
    <div className="add-expense-container">
      <h2>Add New Expense</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <input
            type="text"
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="amount">Amount</label>
          <input
            type="number"
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="paidBy">Paid By</label>
          <select
            id="paidBy"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            required
          >
            <option value="">Select who paid</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {user.username}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Participants</label>
          <div className="participants-list">
            {users.map((user) => (
              <div key={user._id} className="participant-item">
                <input
                  type="checkbox"
                  id={`participant-${user._id}`}
                  checked={participants.includes(user._id)}
                  onChange={() => handleParticipantToggle(user._id)}
                />
                <label htmlFor={`participant-${user._id}`}>{user.username}</label>
              </div>
            ))}
          </div>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Adding..." : "Add Expense"}
        </button>
      </form>
    </div>
  );
};

const PaymentButton = ({ toUserId, amount, username }) => {
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await axios.post("/api/payments", {
        toUserId,
        amount,
      });
      setPaymentUrl(response.data.paymentUrl);
      alert(`Payment initiated. Redirect to: ${response.data.paymentUrl}`);
    } catch (error) {
      console.error("Error initiating payment:", error);
      alert("Failed to initiate payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="payment-button"
      onClick={handlePayment}
      disabled={loading}
    >
      {loading ? "Processing..." : `Pay ${username}`}
    </button>
  );
};

// App component
function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;