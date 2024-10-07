const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// Create MySQL connection (using environment variables from .env file)
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "red_onion",
});

// Connect to the database
db.connect((err) => {
    if (err) {
        console.error("Error connecting to MySQL:", err);
        return;
    }
    console.log("Connected to MySQL database");
});

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || "secretKey";

// Root route
app.get("/", (req, res) => {
    res.send("Welcome to the Red Onion API!");
});

// Signup Route
app.post("/signup", (req, res) => {
    const { username, email, password } = req.body;

    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err)
            return res.status(500).json({ error: "Password hashing failed" });

        // Insert new user into the database
        const sql =
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
        db.query(sql, [username, email, hashedPassword], (err, result) => {
            if (err)
                return res
                    .status(500)
                    .json({ error: "Signup failed, try again" });
            res.json({ message: "User created successfully" });
        });
    });
});

// Login Route
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    // Check if the user exists
    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], (err, results) => {
        if (err) return res.status(500).json({ error: "Database query error" });
        if (results.length === 0)
            return res.status(400).json({ message: "User not found" });

        const user = results[0];

        // Compare the provided password with the hashed password
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err)
                return res
                    .status(500)
                    .json({ error: "Password comparison failed" });
            if (!isMatch)
                return res.status(400).json({ message: "Invalid credentials" });

            // Generate a JWT token
            const token = jwt.sign({ id: user.id }, JWT_SECRET, {
                expiresIn: "1h",
            });

            // Send the token and the username back to the client
            res.json({
                token,
                username: user.username,
                user_id: user.id,
            });
        });
    });
});

// Get all users
app.get("/users", (req, res) => {
    const sql = "SELECT * FROM users";
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching users" });
        res.json(results);
    });
});

// Add a new food item to the database
app.post("/food/add", (req, res) => {
    const { category, name, shortDescription, price, image, description } =
        req.body;

    // Validate the input
    if (!category || !name || !price || !description) {
        return res
            .status(400)
            .json({
                message:
                    "Please provide all required fields (category, name, price, and description)",
            });
    }

    // SQL query to insert a new food item into the database
    const sql =
        "INSERT INTO food (category, name, shortDescription, price, image, description) VALUES (?, ?, ?, ?, ?, ?)";

    db.query(
        sql,
        [category, name, shortDescription, price, image, description],
        (err, result) => {
            if (err) {
                return res
                    .status(500)
                    .json({ error: "Error adding food item to the database" });
            }

            res.json({
                message: "Food item added successfully",
                foodId: result.insertId,
            });
        }
    );
});

// Get all food items (for displaying food items to users)
app.get("/food", (req, res) => {
    const sql = "SELECT * FROM food";
    db.query(sql, (err, results) => {
        if (err)
            return res.status(500).json({ error: "Error fetching food items" });
        res.json(results);
    });
});

// Get a specific food item by its ID
app.get("/food/:id", (req, res) => {
    const { id } = req.params; 
    const sql = "SELECT * FROM food WHERE id = ?"; 

    db.query(sql, [id], (err, result) => {
        if (err) {
            return res
                .status(500)
                .json({ error: "Error fetching the food item" });
        }

        // If no food item is found, send a 404 response
        if (result.length === 0) {
            return res.status(404).json({ message: "Food item not found" });
        }

        // Return the food item details as JSON
        res.json(result[0]);
    });
});

// Delete a specific food item by its ID
app.delete("/food/delete/:id", (req, res) => {
    const { id } = req.params; 

    const sql = "DELETE FROM food WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Error deleting food item" });
        }

        // If no rows were affected, it means the food item wasn't found
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Food item not found" });
        }

        res.json({ message: "Food item deleted successfully" });
    });
});

// Get cart info with usernames
app.get("/cart/info", (req, res) => {
    const sql = `
        SELECT users.username, cart.food_id, cart.quantity, food.name 
        FROM cart 
        JOIN food ON cart.food_id = food.id
        JOIN users ON cart.user_id = users.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Error fetching cart items" });
        res.json(results);
    });
});

// Add food to the user's cart
app.post("/cart/add", (req, res) => {
    const { user_id, food_id, quantity } = req.body;

    // Validate input: Ensure user_id, food_id, and quantity are provided
    if (!user_id || !food_id || quantity === undefined) {
        return res
            .status(400)
            .json({
                error: "Invalid input. Ensure valid user_id, food_id, and quantity.",
            });
    }

    // If the quantity is 0, remove the item from the cart
    if (quantity === 0) {
        const deleteSql = `DELETE FROM cart WHERE user_id = ? AND food_id = ?`;
        db.query(deleteSql, [user_id, food_id], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res
                    .status(500)
                    .json({
                        error: "Error removing item from cart. Please try again.",
                    });
            }

            return res
                .status(200)
                .json({ message: "Item removed from cart successfully" });
        });
    } else {
        // Otherwise, add or update the cart item with the new quantity
        const sql = `
            INSERT INTO cart (user_id, food_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
        `;

        db.query(sql, [user_id, food_id, quantity], (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res
                    .status(500)
                    .json({
                        error: "Error adding/updating cart. Please try again.",
                    });
            }

            res.status(200).json({
                message: "Food item added/updated in cart successfully",
            });
        });
    }
});

// Remove food from the user's cart
app.post("/cart/remove", (req, res) => {
    const { user_id, food_id } = req.body;

    const sql = "DELETE FROM cart WHERE user_id = ? AND food_id = ?";
    db.query(sql, [user_id, food_id], (err, result) => {
        if (err)
            return res.status(500).json({ error: "Error removing from cart" });
        res.json({ message: "Food item removed from cart successfully" });
    });
});

// Clear Cart Route - DELETE all items for a specific user
app.post("/cart/clear", (req, res) => {
    const { user_id } = req.body;

    const sql = "DELETE FROM cart WHERE user_id = ?";
    db.query(sql, [user_id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Error clearing cart" });
        }
        res.json({ message: "Cart cleared successfully" });
    });
});

// Get cart items for a user
app.get("/cart/:user_id", (req, res) => {
    const { user_id } = req.params;

    const sql = `SELECT food.*, cart.quantity 
               FROM cart 
               JOIN food ON cart.food_id = food.id 
               WHERE cart.user_id = ?`;
    db.query(sql, [user_id], (err, results) => {
        if (err)
            return res.status(500).json({ error: "Error fetching cart items" });
        res.json(results);
    });
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});
