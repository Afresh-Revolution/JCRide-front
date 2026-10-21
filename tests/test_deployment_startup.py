import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import vercel_build


class DeploymentStartupTest(unittest.TestCase):
    def test_wsgi_imports_and_preserves_both_merged_admin_features(self):
        from wsgi import app

        self.assertTrue(callable(app))
        self.assertIn("admin.owner_dashboard", app.view_functions)
        self.assertIn("admin.landmark_transaction_receipt", app.view_functions)

    def test_homepage_renders_when_backend_is_unavailable(self):
        from wsgi import app
        from app.services.api_client import ApiError
        from app.services.landing_content import invalidate_landing_cache

        invalidate_landing_cache()
        try:
            with patch("app.services.landing_content.get_public_landing_page", side_effect=ApiError("Backend unavailable", 503)):
                response = app.test_client().get("/")
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"JosRide", response.data)
        finally:
            invalidate_landing_cache()

    def test_invalid_route_source_fails_build_before_assets_are_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app").mkdir()
            (root / "app" / "broken.py").write_text("<<<<<<< HEAD\n", encoding="utf-8")
            with patch.object(vercel_build, "ROOT", root), patch.object(vercel_build.shutil, "rmtree") as remove, patch.object(vercel_build.shutil, "copytree") as copy:
                with self.assertRaises(SyntaxError):
                    vercel_build.main()
                remove.assert_not_called()
                copy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
