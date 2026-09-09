"""Run with: python -m unittest scripts.test_funding_names"""
import unittest
from unittest.mock import patch

from flask import Flask
from app.admin_ops_transforms import account_display_name, normalize_funding_list
from app.routes.admin import api_funding_requests
from app.services.api_client import ApiError


class FundingNamesTests(unittest.TestCase):
    def test_pending_paystack_and_manual_requests_can_be_approved(self):
        for provider in ("manual", "paystack"):
            for status in ("pending", "approved", "rejected"):
                row = normalize_funding_list({"items": [{"provider": provider, "status": status}]})["items"][0]
                self.assertEqual(row["can_approve"], status == "pending")

    def test_account_shapes(self):
        for profile, expected in [
            ({"full_name": "Ada Okafor"}, "Ada Okafor"),
            ({"user_firstname": "Ada", "user_lastname": "Okafor"}, "Ada Okafor"),
            ({"data": {"business_name": "JosCity Stores"}}, "JosCity Stores"),
            ({"user": {"username": "ada123"}}, "ada123"),
            ({"user_name": "Unknown user"}, ""),
        ]:
            self.assertEqual(account_display_name(profile), expected)

    def test_missing_names_are_looked_up_once_per_account(self):
        data = {"items": [{"user_id": "one"}, {"user_id": "one"}, {"user_id": "two", "user_name": "Existing Name"}]}
        with Flask(__name__).test_request_context(), patch("app.routes.admin._admin_token", return_value="token"), patch("app.routes.admin.get_admin_funding_requests", return_value=data), patch("app.routes.admin.get_admin_user", return_value={"user_firstname": "Ada", "user_lastname": "Okafor"}) as lookup:
            result = api_funding_requests.__wrapped__().get_json()
        lookup.assert_called_once_with("token", "one", timeout=(2, 3), max_attempts=1)
        self.assertEqual([row["user_name"] for row in result["items"]], ["Ada Okafor", "Ada Okafor", "Existing Name"])

    def test_unavailable_profile_does_not_break_queue(self):
        with Flask(__name__).test_request_context(), patch("app.routes.admin._admin_token", return_value="token"), patch("app.routes.admin.get_admin_funding_requests", return_value={"items": [{"user_id": "one"}]}), patch("app.routes.admin.get_admin_user", side_effect=ApiError("Not found", 404)):
            result = api_funding_requests.__wrapped__().get_json()
        self.assertEqual(result["items"][0]["user_name"], "Unknown user")

    def test_profile_lookup_deadline_keeps_requests_visible(self):
        with Flask(__name__).test_request_context(), patch("app.routes.admin._admin_token", return_value="token"), patch("app.routes.admin.get_admin_funding_requests", return_value={"items": [{"id": "funding", "user_id": "one", "status": "pending", "provider": "paystack"}]}), patch("app.routes.admin.get_admin_user", return_value={"full_name": "Ada"}), patch("concurrent.futures.wait", return_value=(set(), set())) as wait:
            result = api_funding_requests.__wrapped__().get_json()
        self.assertEqual(wait.call_args.kwargs["timeout"], 3)
        self.assertEqual(result["items"][0]["id"], "funding")
        self.assertTrue(result["items"][0]["can_approve"])
