"""
patch_cms_asset_handler.py
Fixes RawPostDataException in CMS asset_storage_handlers.py
Run once during tutor init: python3 /mnt/military-edx-plugin/patch_cms_asset_handler.py
"""
path = '/openedx/edx-platform/cms/djangoapps/contentstore/asset_storage_handlers.py'

with open(path) as f:
    content = f.read()

MARKER = '# MILITARY_PATCH: content_type_check_v1'

if MARKER in content:
    print('Already patched - skipping')
    raise SystemExit(0)

old = (
    "    elif request.method in ('PUT', 'POST'):\n"
    "        if 'file' in request.FILES:\n"
    "            return _upload_asset(request, course_key)\n"
    "\n"
    "        # update existing asset\n"
    "        try:\n"
    "            modified_asset = json.loads(request.body.decode('utf8'))"
)

new = (
    "    elif request.method in ('PUT', 'POST'):\n"
    "        " + MARKER + "\n"
    "        # Check Content-Type first to avoid consuming body stream via request.FILES\n"
    "        content_type = request.content_type or ''\n"
    "        is_multipart = 'multipart' in content_type or 'form-data' in content_type\n"
    "        if is_multipart:\n"
    "            return _upload_asset(request, course_key)\n"
    "\n"
    "        # update existing asset (JSON body)\n"
    "        try:\n"
    "            modified_asset = json.loads(request.body.decode('utf8'))"
)

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print('Asset handler patched OK')
else:
    print('Pattern not found - may already be patched or version changed')
