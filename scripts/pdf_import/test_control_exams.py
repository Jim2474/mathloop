import hashlib
import tempfile
import unittest
from pathlib import Path

import fitz
from app_worker import source_fingerprint
from control_exams import FINGERPRINT, select_marks, extract_control_exams

SOURCE = Path('/Users/jim./_courses/考研资料/专业课复盘/自动控制原理真题.pdf')


@unittest.skipUnless(SOURCE.exists(), 'Local control exam scan not available')
class ControlExamTests(unittest.TestCase):
    def test_crosses_are_merged_and_scores_are_excluded(self):
        with fitz.open(SOURCE) as doc:
            self.assertEqual(source_fingerprint(doc), FINGERPRINT)
            selected, issues, evidence = select_marks(doc)
            self.assertFalse(issues)
            expected = {2005: [1, 2, 5, 6, 10], 2006: [3, 4, 5, 6], 2007: [1, 3, 6, 8],
                        2008: [7, 9], 2009: [1, 2, 3, 5, 7, 9], 2010: [3, 5, 7], 2011: [1, 2, 3, 4, 5, 7, 9]}
            self.assertEqual(sorted(selected), [(y, n) for y, ns in expected.items() for n in ns])
            self.assertEqual(len(evidence), 97)
            self.assertNotIn((2006, 7), selected)  # Red score 5, no cross.
            self.assertNotIn((2007, 9), selected)  # Red score 0, no cross.
            self.assertNotIn((2006, 11), selected)  # Black cross, no red mark.

    def test_new_unverified_ink_does_not_guess_a_question(self):
        with fitz.open(SOURCE) as doc:
            page = doc[23]
            annot = page.add_ink_annot([[(100, 600), (180, 690)]])
            annot.set_colors(stroke=(1, 0, 0))
            selected, issues, _ = select_marks(doc)
            self.assertEqual(len(selected), 31)
            self.assertEqual(issues[0]['page'], 24)
            self.assertEqual(source_fingerprint(doc), FINGERPRINT)

    def test_repeat_import_needs_no_answers_and_renders_nothing(self):
        with fitz.open(SOURCE) as doc, tempfile.TemporaryDirectory() as tmp:
            selected, _, _ = select_marks(doc)
            existing = [{'pdfSource': {'sourceFingerprint': FINGERPRINT, 'sourceKey':
                         hashlib.sha256(f'{FINGERPRINT}:cjlu801:{y}:{n}'.encode()).hexdigest()[:24]}}
                        for y, n in selected]
            result = extract_control_exams(doc, FINGERPRINT, str(SOURCE), Path(tmp), existing, lambda *a: None)
            self.assertEqual(result['questions'], [])
            self.assertEqual(result['duplicates'], 31)
            self.assertEqual(list(Path(tmp).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
