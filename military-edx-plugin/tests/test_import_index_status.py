"""
tests/test_import_index_status.py

The question-bank importer (api_import_execute) creates Content Library
blocks synchronously, but the Meilisearch reindex that makes them show up
in Studio's Library page is dispatched fire-and-forget to the CMS celery
queue (see _reindex_library_search's docstring — content.search is CMS-only,
so LMS can't call it directly or know when it finishes).

_get_library_index_count() / api_import_index_status() close that gap by
querying Meilisearch directly over HTTP (its URL/API key are plain Django
settings available on LMS too), so the import UI can poll real "indexing..."
-> "done" progress instead of guessing a fixed delay.
"""
from unittest.mock import patch, MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.test import Client, override_settings

User = get_user_model()

MEILI_SETTINGS = dict(
    MEILISEARCH_URL="http://meilisearch:7700",
    MEILISEARCH_API_KEY="test-key",
    MEILISEARCH_INDEX_PREFIX="tutor_",
)


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(username="import_status_staff", password="x", is_staff=True)


@pytest.fixture
def plain_user(db):
    return User.objects.create_user(username="import_status_plain", password="x")


class TestGetLibraryIndexCount:
    def test_returns_estimated_total_hits(self):
        from military_profile.api_views import _get_library_index_count
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"estimatedTotalHits": 15}
        mock_resp.raise_for_status.return_value = None
        with override_settings(**MEILI_SETTINGS):
            with patch("requests.post", return_value=mock_resp) as mock_post:
                count = _get_library_index_count("lib:SSC:CMDPROM1")
        assert count == 15
        called_url = mock_post.call_args.args[0]
        assert called_url == "http://meilisearch:7700/indexes/tutor_studio_content/search"
        assert mock_post.call_args.kwargs["json"]["filter"] == 'context_key = "lib:SSC:CMDPROM1"'
        assert mock_post.call_args.kwargs["headers"]["Authorization"] == "Bearer test-key"

    def test_returns_none_when_settings_missing(self):
        from military_profile.api_views import _get_library_index_count
        with override_settings(MEILISEARCH_URL=None, MEILISEARCH_API_KEY=None):
            assert _get_library_index_count("lib:SSC:CMDPROM1") is None

    def test_returns_none_on_request_failure(self):
        from military_profile.api_views import _get_library_index_count
        with override_settings(**MEILI_SETTINGS):
            with patch("requests.post", side_effect=Exception("connection refused")):
                assert _get_library_index_count("lib:SSC:CMDPROM1") is None


class TestApiImportIndexStatus:
    def test_requires_admin_or_instructor(self, plain_user):
        # _is_admin_or_instructor() falls through to a CourseAccessRole
        # lookup in common.djangoapps.student -- an edx-platform app this
        # standalone test environment doesn't install (see conftest.py's
        # INSTALLED_APPS). Patch the permission check itself so this test
        # exercises the endpoint's own 403 handling, not edx-platform.
        client = Client()
        client.force_login(plain_user)
        with patch("military_profile.api_views._is_admin_or_instructor", return_value=False):
            resp = client.get("/military/api/v1/import/libraries/lib:SSC:CMDPROM1/index-status/")
        assert resp.status_code == 403

    def test_returns_count_for_staff(self, staff_user):
        client = Client()
        client.force_login(staff_user)
        with patch("military_profile.api_views._get_library_index_count", return_value=15):
            resp = client.get("/military/api/v1/import/libraries/lib:SSC:CMDPROM1/index-status/")
        assert resp.status_code == 200
        assert resp.json() == {"count": 15}

    def test_503_when_meilisearch_unreachable(self, staff_user):
        client = Client()
        client.force_login(staff_user)
        with patch("military_profile.api_views._get_library_index_count", return_value=None):
            resp = client.get("/military/api/v1/import/libraries/lib:SSC:CMDPROM1/index-status/")
        assert resp.status_code == 503
