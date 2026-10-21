import unittest
from unittest.mock import patch
from app.factory import create_app
from app.services.api_client import ApiError


class OwnerDashboardTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config.update(TESTING=True, SECRET_KEY="owner-test-session-key")
        self.client = self.app.test_client()

    def owner_session(self):
        with self.client.session_transaction() as session:
            session.update(owner_token="owner-access", owner_csrf="owner-csrf", admin_portal_entry=True)

    def test_shared_login_redirects_owner_to_separate_dashboard(self):
        self.client.post("/admin/enter")
        with patch("app.routes.admin.admin_login", return_value={"access_token": "owner-access", "role": "owner"}):
            response = self.client.post("/admin/login", data={"email": "owner@example.com", "password": "private"})
        self.assertEqual(response.location, "/admin/owner")
        with self.client.session_transaction() as session:
            self.assertEqual(session["owner_token"], "owner-access")
            self.assertNotIn("admin_token", session)
        response = self.client.get("/admin/owner")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Your platform at a glance", response.data)
        self.assertNotIn(b"owner-access", response.data)
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_normal_admin_cannot_use_owner_api(self):
        with self.client.session_transaction() as session:
            session.update(admin_token="ordinary-admin", admin_portal_entry=True)
        self.assertEqual(self.client.get("/admin/owner/api/overview").status_code, 401)
        self.assertEqual(self.client.put("/admin/owner/api/call-system", json={"paused": True}).status_code, 401)

    def test_csrf_is_required_for_pause(self):
        self.owner_session()
        with patch("app.routes.admin.set_owner_call_system") as update:
            response = self.client.put("/admin/owner/api/call-system", json={"paused": True})
            self.assertEqual(response.status_code, 403)
            update.assert_not_called()

    def test_pause_and_unpause_forward_explicit_booleans(self):
        self.owner_session()
        for paused in [True, False]:
            with patch("app.routes.admin.set_owner_call_system", return_value={"paused": paused, "ended_calls": 0}) as update:
                response = self.client.put("/admin/owner/api/call-system", json={"paused": paused}, headers={"X-Owner-CSRF": "owner-csrf"})
                self.assertEqual(response.status_code, 200)
                update.assert_called_once_with("owner-access", paused)
        response = self.client.put("/admin/owner/api/call-system", json={"paused": "false"}, headers={"X-Owner-CSRF": "owner-csrf"})
        self.assertEqual(response.status_code, 422)

    def test_expired_owner_session_is_removed(self):
        self.owner_session()
        with patch("app.routes.admin.get_owner_overview", side_effect=ApiError("Expired", 403)):
            self.assertEqual(self.client.get("/admin/owner/api/overview").status_code, 403)
        with self.client.session_transaction() as session:
            self.assertNotIn("owner_token", session)

    def test_normal_admin_login_keeps_current_dashboard(self):
        self.client.post("/admin/enter")
        with patch("app.routes.admin.admin_login", return_value={"access_token": "ordinary-admin", "user": {"role": "admin"}}):
            response = self.client.post("/admin/login", data={"email": "ops@example.com", "password": "private"})
        self.assertEqual(response.location, "/admin/")


if __name__ == "__main__":
    unittest.main()
