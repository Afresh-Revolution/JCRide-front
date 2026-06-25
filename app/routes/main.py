from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from app.services.api_client import ApiError, login, register, request_ride, set_availability

main_bp = Blueprint("main", __name__)

@main_bp.route("/")
def home():
    return render_template("home.html")

@main_bp.route("/login", methods=["GET", "POST"])
def login_page():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        try:
            result = login(email, password)
            session["token"] = result.get("access_token", "logged-in")
            session["email"] = email
            flash("Signed in successfully.", "success")
            return redirect(url_for("main.home"))
        except ApiError as exc:
            flash(exc.message, "error")
    return render_template("login.html")

@main_bp.route("/register", methods=["GET", "POST"])
def register_page():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        role = request.form.get("role", "rider")
        try:
            register(name, email, password, role)
            flash("Account created. You can sign in now.", "success")
            return redirect(url_for("main.login_page"))
        except ApiError as exc:
            flash(exc.message, "error")
    return render_template("register.html")

@main_bp.route("/ride", methods=["GET", "POST"])
def ride_page():
    if "token" not in session:
        flash("Please sign in before booking a ride.", "error")
        return redirect(url_for("main.login_page"))
    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        dropoff = request.form.get("dropoff", "").strip()
        try:
            request_ride(session["token"], pickup, dropoff)
            flash("Ride requested — waiting for a driver.", "success")
        except ApiError as exc:
            flash(exc.message, "error")
    return render_template("ride.html")

@main_bp.route("/driver", methods=["GET", "POST"])
def driver_page():
    if "token" not in session:
        flash("Please sign in as a driver first.", "error")
        return redirect(url_for("main.login_page"))
    online = session.get("driver_online", False)
    if request.method == "POST":
        action = request.form.get("action")
        try:
            new_status = action == "online"
            set_availability(session["token"], new_status)
            session["driver_online"] = new_status
            flash("You are now online." if new_status else "You are now offline.", "success")
            online = new_status
        except ApiError as exc:
            flash(exc.message, "error")
    return render_template("driver.html", online=online)

@main_bp.route("/logout")
def logout():
    session.clear()
    flash("Signed out.", "success")
    return redirect(url_for("main.home"))
