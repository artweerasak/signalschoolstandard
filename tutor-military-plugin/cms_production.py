# -*- coding: utf-8 -*-
import os
from cms.envs.production import *

####### Settings common to LMS and CMS
import json
import os

from xmodule.modulestore.modulestore_settings import update_module_store_settings

# Mongodb connection parameters: simply modify `mongodb_parameters` to affect all connections to MongoDb.
mongodb_parameters = {
    "db": "openedx",
    "host": "mongodb",
    "port": 27017,
    "user": None,
    "password": None,
    # Connection/Authentication
    "connect": False,
    "ssl": False,
    "authsource": "admin",
    "replicaSet": None,
    
}
DOC_STORE_CONFIG = mongodb_parameters
CONTENTSTORE = {
    "ENGINE": "xmodule.contentstore.mongo.MongoContentStore",
    "ADDITIONAL_OPTIONS": {},
    "DOC_STORE_CONFIG": DOC_STORE_CONFIG
}
# Load module store settings from config files
update_module_store_settings(MODULESTORE, doc_store_settings=DOC_STORE_CONFIG)
DATA_DIR = "/openedx/data/modulestore"

for store in MODULESTORE["default"]["OPTIONS"]["stores"]:
   store["OPTIONS"]["fs_root"] = DATA_DIR

# Behave like memcache when it comes to connection errors
DJANGO_REDIS_IGNORE_EXCEPTIONS = True

# Meilisearch connection parameters
MEILISEARCH_ENABLED = True
MEILISEARCH_URL = "http://meilisearch:7700"
MEILISEARCH_PUBLIC_URL = "https://meilisearch.signalstandard.rta.mi.th"
MEILISEARCH_INDEX_PREFIX = "tutor_"
MEILISEARCH_API_KEY = "501ae5f727bc4b3df28a6d93176da6042679f790bd8b26f839fdc2247caf8e34"
MEILISEARCH_MASTER_KEY = "PXnvL0u3gKQy7aXS975b1YpI"
SEARCH_ENGINE = "search.meilisearch.MeilisearchEngine"

# Common cache config
CACHES = {
    "default": {
        "KEY_PREFIX": "default",
        "VERSION": "1",
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "general": {
        "KEY_PREFIX": "general",
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "mongo_metadata_inheritance": {
        "KEY_PREFIX": "mongo_metadata_inheritance",
        "TIMEOUT": 300,
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "configuration": {
        "KEY_PREFIX": "configuration",
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "celery": {
        "KEY_PREFIX": "celery",
        "TIMEOUT": 7200,
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "course_structure_cache": {
        "KEY_PREFIX": "course_structure",
        "TIMEOUT": 604800, # 1 week
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    },
    "ora2-storage": {
        "KEY_PREFIX": "ora2-storage",
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://@redis:6379/1",
    }
}

# The default Django contrib site is the one associated to the LMS domain name. 1 is
# usually "example.com", so it's the next available integer.
SITE_ID = 2

# Contact addresses
CONTACT_MAILING_ADDRESS = "โรงเรียนทหารสื่อสาร - https://signalstandard.rta.mi.th"
DEFAULT_FROM_EMAIL = ENV_TOKENS.get("DEFAULT_FROM_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
DEFAULT_FEEDBACK_EMAIL = ENV_TOKENS.get("DEFAULT_FEEDBACK_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
SERVER_EMAIL = ENV_TOKENS.get("SERVER_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
TECH_SUPPORT_EMAIL = ENV_TOKENS.get("TECH_SUPPORT_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
CONTACT_EMAIL = ENV_TOKENS.get("CONTACT_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
BUGS_EMAIL = ENV_TOKENS.get("BUGS_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
UNIVERSITY_EMAIL = ENV_TOKENS.get("UNIVERSITY_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
PRESS_EMAIL = ENV_TOKENS.get("PRESS_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
PAYMENT_SUPPORT_EMAIL = ENV_TOKENS.get("PAYMENT_SUPPORT_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
BULK_EMAIL_DEFAULT_FROM_EMAIL = ENV_TOKENS.get("BULK_EMAIL_DEFAULT_FROM_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
API_ACCESS_MANAGER_EMAIL = ENV_TOKENS.get("API_ACCESS_MANAGER_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])
API_ACCESS_FROM_EMAIL = ENV_TOKENS.get("API_ACCESS_FROM_EMAIL", ENV_TOKENS["CONTACT_EMAIL"])

# Get rid completely of coursewarehistoryextended, as we do not use the CSMH database
INSTALLED_APPS.remove("lms.djangoapps.coursewarehistoryextended")
DATABASE_ROUTERS.remove(
    "openedx.core.lib.django_courseware_routers.StudentModuleHistoryExtendedRouter"
)

# Set uploaded media file path
MEDIA_ROOT = "/openedx/media/"

# Video settings
VIDEO_IMAGE_SETTINGS["STORAGE_KWARGS"]["location"] = MEDIA_ROOT
VIDEO_TRANSCRIPTS_SETTINGS["STORAGE_KWARGS"]["location"] = MEDIA_ROOT

GRADES_DOWNLOAD = {
    "STORAGE_TYPE": "",
    "STORAGE_KWARGS": {
        "base_url": "/media/grades/",
        "location": "/openedx/media/grades",
    },
}

# ORA2
ORA2_FILEUPLOAD_BACKEND = "filesystem"
ORA2_FILEUPLOAD_ROOT = "/openedx/data/ora2"
FILE_UPLOAD_STORAGE_BUCKET_NAME = "openedxuploads"
ORA2_FILEUPLOAD_CACHE_NAME = "ora2-storage"

# Change syslog-based loggers which don't work inside docker containers
LOGGING["handlers"]["local"] = {
    "class": "logging.handlers.WatchedFileHandler",
    "filename": os.path.join(LOG_DIR, "all.log"),
    "formatter": "standard",
}
LOGGING["handlers"]["tracking"] = {
    "level": "DEBUG",
    "class": "logging.handlers.WatchedFileHandler",
    "filename": os.path.join(LOG_DIR, "tracking.log"),
    "formatter": "standard",
}
LOGGING["loggers"]["tracking"]["handlers"] = ["console", "local", "tracking"]

# Silence some loggers (note: we must attempt to get rid of these when upgrading from one release to the next)
LOGGING["loggers"]["blockstore.apps.bundles.storage"] = {"handlers": ["console"], "level": "WARNING"}

# These warnings are visible in simple commands and init tasks
import warnings

# REMOVE-AFTER-V20: check if we can remove these lines after upgrade.
try:
    from django.utils.deprecation import RemovedInDjango50Warning, RemovedInDjango51Warning
    # RemovedInDjango5xWarning: 'xxx' is deprecated. Use 'yyy' in 'zzz' instead.
    warnings.filterwarnings("ignore", category=RemovedInDjango50Warning)
    warnings.filterwarnings("ignore", category=RemovedInDjango51Warning)
    # DeprecationWarning: 'imghdr' is deprecated and slated for removal in Python 3.13
    warnings.filterwarnings("ignore", category=DeprecationWarning, module="pgpy.constants")
except ImportError:
    pass # If the warnings don't exist we don't need to filter them.
    
# Email
EMAIL_USE_SSL = False
# Forward all emails from edX's Automated Communication Engine (ACE) to django.
ACE_ENABLED_CHANNELS = ["django_email"]
ACE_CHANNEL_DEFAULT_EMAIL = "django_email"
ACE_CHANNEL_TRANSACTIONAL_EMAIL = "django_email"
EMAIL_FILE_PATH = "/tmp/openedx/emails"

# Language/locales
LANGUAGE_COOKIE_NAME = "openedx-language-preference"

# Allow the platform to include itself in an iframe
X_FRAME_OPTIONS = "SAMEORIGIN"


JWT_AUTH["JWT_ISSUER"] = "https://signalstandard.rta.mi.th/oauth2"
JWT_AUTH["JWT_AUDIENCE"] = "openedx"
JWT_AUTH["JWT_SECRET_KEY"] = "ML7SCrZ4iAFrtpipR8iNh8Ig"
JWT_AUTH["JWT_PRIVATE_SIGNING_JWK"] = json.dumps(
    {
        "kid": "openedx",
        "kty": "RSA",
        "e": "AQAB",
        "d": "Ns9_zZJAONyyMCLTJqictFPoe-RyjPK3TiLdoZMwvyJXNZX9t6poUPOQhoMNe-zOTCaY8m945PruvQDGmH8QDOAAYrJ7fUvQQRQHOKLSrBHvuYQdrzKnba2TC5NKLOzPwg0ttCs20raj3it2pKSIgEZS44RaoI0WzOVoQg9BHqhhiUpTHEGYLomH1fvqaf0m5Aq2mAajmUmcDyOGBnpJObvi6C-ItKJUCHVxiczq6mTfWJO3MDd1W7euTnsS8N_QFtijVoj9ZfzVmp07nE--HHdu6S0Dya36PKI2Ep-t3LqkuDussYujbIjPg08H0s4fuSM94QBaiAmbMZao0q1XMQ",
        "n": "yiaauqPCETNPaiCQNCYcaL7fK-OYqpf64ixiOzWBAnF1MLgbkcpdEo-zClwLXdefBx9i7JQewBxn7dcuFXJYwkLDskYewVBGYA24MS9lMskDixoHUriSx8Nx0oXZYPMjL7inimWYkr0uz9YAcrkg1lrZ3s95G87dINuEaV0XbmfS97DIxBR8BY4sOgsc0ssUcL1QSEUA__UpfEgEC80wwh37P5GQflucspYto--gU-t-m_Bdr9uh7zTkSNBWGtWqddL85wl8JKMzZOSUGkx5zU3TfBpg-nqNWhTra0HsZRP4pFjscqzoW_MTYAtjaxRqxAPCd11UnJ9GoBd_rboZfw",
        "p": "2tXsvqhuFMQJzbgd7SOu7CxfYrOCVdlnTwIUJgD-0cYi4L0D7PW08QpAHCU9yW3lsHTJe4R7m5F9ZZwM0rRrdcVmOKeSGUvbLAsyBswhWERXXzOLbq6TR9pqd_qvWWHcuCthwF0ifZ7MTMQ2pnnZpipUnSBWNENg5aDgBAsz1u8",
        "q": "7HtKg1xkDAQvRURKfibK8ss0el4BHq3WWaYkUfVkrjTdONXGRBRo-K3L84aCzj4opPqy-HF0VH26WNVT2ReG-9aG_6E_ReAPg3NUUIBOUgvtHtXutzCvcIIhT318CtlQV4SQfySRvkJfxnhalsCi8UWSM9no0G3QgLe7licbZnE",
        "dq": "SiUN48ngBHR7bbhPsuXu09kqhwNaTogqoMkasifCfWxNwDgmhcnwb6fuPlh6QrfyfmesHYFU-_i_qIKaW4Ko6-UDRrsD36C0vH44fVT9OXRL0FM7GWzGVPw3_XhWoAAq1IXX2EVa_NBKvyuVG5cif4tUn7U-7brAmNsCkb2JNcE",
        "dp": "PvnJQ6Tc6QTxfU467n-SW0z5tkHKhEIoRMhoW_d1XZETgHFkq9CZ3bQBdxgQi-MgcoNpaC5cFAzudUtPNWPOePnxzOQMW1NFI4ulPeeIwQoJys_elF-Q6uCkOxrdU2-iQS3a16z1vAjy6jSdNZNjWzpbV0xzAl9Rh0OgtAk1Rek",
        "qi": "zkRQGGPnlWNsQZN5T7bJAex3e7d7QLa5nqDuVJiCqNh5B8R8vnWTgG596v3c7_GmukJVTX7TWDwicYed3zqQP9SkjWiyoGW1L2Wos52LxT1BZ9_btZ978ljg4nu_riLoU9uCE-MwSqVvDjJaMqVU-zlVJyhwrJA_9_hEfvKu5cs",
    }
)
JWT_AUTH["JWT_PUBLIC_SIGNING_JWK_SET"] = json.dumps(
    {
        "keys": [
            {
                "kid": "openedx",
                "kty": "RSA",
                "e": "AQAB",
                "n": "yiaauqPCETNPaiCQNCYcaL7fK-OYqpf64ixiOzWBAnF1MLgbkcpdEo-zClwLXdefBx9i7JQewBxn7dcuFXJYwkLDskYewVBGYA24MS9lMskDixoHUriSx8Nx0oXZYPMjL7inimWYkr0uz9YAcrkg1lrZ3s95G87dINuEaV0XbmfS97DIxBR8BY4sOgsc0ssUcL1QSEUA__UpfEgEC80wwh37P5GQflucspYto--gU-t-m_Bdr9uh7zTkSNBWGtWqddL85wl8JKMzZOSUGkx5zU3TfBpg-nqNWhTra0HsZRP4pFjscqzoW_MTYAtjaxRqxAPCd11UnJ9GoBd_rboZfw",
            }
        ]
    }
)
JWT_AUTH["JWT_ISSUERS"] = [
    {
        "ISSUER": "https://signalstandard.rta.mi.th/oauth2",
        "AUDIENCE": "openedx",
        "SECRET_KEY": "ML7SCrZ4iAFrtpipR8iNh8Ig"
    }
]

# Enable/Disable some features globally
FEATURES["ENABLE_DISCUSSION_SERVICE"] = False
FEATURES["PREVENT_CONCURRENT_LOGINS"] = False
FEATURES["ENABLE_CORS_HEADERS"] = True

# CORS
CORS_ALLOW_CREDENTIALS = True
CORS_ORIGIN_ALLOW_ALL = False
CORS_ALLOW_INSECURE = False
# Note: CORS_ALLOW_HEADERS is intentionally not defined here, because it should
# be consistent across deployments, and is therefore set in edx-platform.

# Add your MFE and third-party app domains here
CORS_ORIGIN_WHITELIST = []

# Disable codejail support
# explicitely configuring python is necessary to prevent unsafe calls
import codejail.jail_code
codejail.jail_code.configure("python", "nonexistingpythonbinary", user=None)
# another configuration entry is required to override prod/dev settings
CODE_JAIL = {
    "python_bin": "nonexistingpythonbinary",
    "user": None,
}

OPENEDX_LEARNING = {
    'MEDIA': {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {
            "location": "/openedx/media-private/openedx-learning",
        }
    }
}

# edx-event-bus-redis settings
EVENT_BUS_PRODUCER = 'edx_event_bus_redis.create_producer'
EVENT_BUS_REDIS_CONNECTION_URL = 'redis://@redis:6379/'
EVENT_BUS_TOPIC_PREFIX = 'dev'
EVENT_BUS_CONSUMER = 'edx_event_bus_redis.RedisEventConsumer'


######## End of settings common to LMS and CMS

######## Common CMS settings
STUDIO_NAME = "โรงเรียนทหารสื่อสาร"

CACHES["staticfiles"] = {
    "KEY_PREFIX": "staticfiles_cms",
    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    "LOCATION": "staticfiles_cms",
}

# Authentication
SOCIAL_AUTH_EDX_OAUTH2_SECRET = "onE9SuRYmCaFOrw86BhUUKzl"
SOCIAL_AUTH_EDX_OAUTH2_URL_ROOT = "http://lms:8000"
SOCIAL_AUTH_REDIRECT_IS_HTTPS = False  # scheme is correctly included in redirect_uri
SESSION_COOKIE_NAME = "studio_session_id"

MAX_ASSET_UPLOAD_FILE_SIZE_IN_MB = 2048

FRONTEND_LOGIN_URL = LMS_ROOT_URL + '/login'
FRONTEND_REGISTER_URL = LMS_ROOT_URL + '/register'

# Enable "reindex" button
FEATURES["ENABLE_COURSEWARE_INDEX"] = True

# Create folders if necessary
for folder in [LOG_DIR, MEDIA_ROOT, STATIC_ROOT, ORA2_FILEUPLOAD_ROOT]:
    if not os.path.exists(folder):
        os.makedirs(folder, exist_ok=True)


# ── Military eLearning Plugin (CMS) ──────────────────────────────
INSTALLED_APPS += [
    "certificate_expiry",
    "military_profile",
]
MILITARY_ENCRYPTION_KEY = "O/xYuPl5hxu2HbeLWhOfW98V7KpAsqk5cjd8zsAb9PM="

######## End of common CMS settings

ALLOWED_HOSTS = [
    ENV_TOKENS.get("CMS_BASE"),
    "cms",
]
CORS_ORIGIN_WHITELIST.append("https://studio-signalstandard.rta.mi.th")

# Authentication
SOCIAL_AUTH_EDX_OAUTH2_KEY = "cms-sso"
SOCIAL_AUTH_EDX_OAUTH2_PUBLIC_URL_ROOT = "https://signalstandard.rta.mi.th"

# MFE-specific settings

COURSE_AUTHORING_MICROFRONTEND_URL = "https://signalstandard.rta.mi.th/authoring"


LOGIN_REDIRECT_WHITELIST.append("apps-signalstandard.rta.mi.th")
LOGIN_REDIRECT_WHITELIST.append("signalstandard.rta.mi.th")
CORS_ORIGIN_WHITELIST.append("https://apps-signalstandard.rta.mi.th")
CORS_ORIGIN_WHITELIST.append("https://signalstandard.rta.mi.th")
CSRF_TRUSTED_ORIGINS.append("https://apps-signalstandard.rta.mi.th")
CSRF_TRUSTED_ORIGINS.append("https://signalstandard.rta.mi.th")