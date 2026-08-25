"""
Fixes grading/max-score for randomized "คลังข้อสอบ" (Content Libraries V2 /
itembank) blocks.

Upstream Open edX ships a block-structure transformer that prunes
unselected children for the *legacy* library_content block
(lms.djangoapps.course_blocks.transformers.library_content.ContentLibraryTransformer)
so that grading only counts the N problems actually shown to a student.
There is no equivalent transformer for the newer itembank block yet, so
without this, a student who is shown 5 random problems out of a 20-problem
pool gets graded out of 20 instead of out of 5.

This transformer mirrors ContentLibraryTransformer's logic exactly, but
targets 'itembank' blocks and uses ItemBankBlock.make_selection instead of
LegacyLibraryContentBlock.make_selection. It is registered via the
"openedx.block_structure_transformer" entry point (see setup.py) and
injected into the default access-transformer list for grading via a
runtime patch in apps.py (LMS only).
"""

import json
import logging

from openedx.core.djangoapps.content.block_structure.transformer import (
    BlockStructureTransformer,
    FilteringTransformerMixin,
)

logger = logging.getLogger(__name__)


class ItemBankGradingTransformer(FilteringTransformerMixin, BlockStructureTransformer):
    """
    Removes unselected children of 'itembank' blocks from the block
    structure, so that grading (max_score/earned_score) is computed only
    over the problems actually selected/shown to each student.
    """

    WRITE_VERSION = 1
    READ_VERSION = 1

    @classmethod
    def name(cls):
        return "military_itembank_grading"

    @classmethod
    def collect(cls, block_structure):
        block_structure.request_xblock_fields('max_count')
        block_structure.request_xblock_fields('category')

    def transform_block_filters(self, usage_info, block_structure):
        try:
            from lms.djangoapps.course_blocks.utils import get_student_module_as_dict
            from lms.djangoapps.courseware.models import StudentModule
            from xmodule.item_bank_block import ItemBankBlock
        except Exception:
            logger.exception("military_itembank_grading: LMS-only imports unavailable, skipping filter")
            return [block_structure.create_removal_filter(lambda block_key: False)]

        all_bank_children = set()
        all_selected_children = set()

        for block_key in block_structure:
            if block_key.block_type != 'itembank':
                continue
            bank_children = block_structure.get_children(block_key)
            if not bank_children:
                continue
            all_bank_children.update(bank_children)

            max_count = block_structure.get_xblock_field(block_key, 'max_count')
            if max_count is None or max_count < 0:
                max_count = len(bank_children)

            state_dict = get_student_module_as_dict(usage_info.user, usage_info.course_key, block_key)
            selected = []
            for selected_block in state_dict.get('selected', []):
                block_type, block_id = selected_block
                usage_key = usage_info.course_key.make_usage_key(block_type, block_id)
                if usage_key in bank_children:
                    selected.append(selected_block)

            block_keys = ItemBankBlock.make_selection(selected, bank_children, max_count)
            selected = block_keys['selected']

            if any(block_keys[changed] for changed in ('invalid', 'overlimit', 'added')):
                state_dict['selected'] = selected
                StudentModule.save_state(
                    student=usage_info.user,
                    course_id=usage_info.course_key,
                    module_state_key=block_key,
                    defaults={'state': json.dumps(state_dict)},
                )

            all_selected_children.update(
                usage_info.course_key.make_usage_key(s[0], s[1]) for s in selected
            )

        def check_child_removal(block_key):
            if block_key not in all_bank_children:
                return False
            if block_key in all_selected_children:
                return False
            return True

        return [block_structure.create_removal_filter(check_child_removal)]
