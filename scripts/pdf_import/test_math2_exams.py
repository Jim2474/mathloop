import json
import tempfile
import unittest
from pathlib import Path

import fitz
fitz.TOOLS.mupdf_display_errors(False)
from app_worker import source_fingerprint
from math2_exams import CATALOG, FINGERPRINT, answer_matches, select_marks, question_parts, answer_parts, extract_math2

SOURCE = Path('/Users/jim./_courses/考研资料/数学真题/【A4紧凑版】10-26年数二真题套卷.pdf')
ANSWERS = SOURCE.parent / '答案文件'
EXPECTED = {
  2010:[1,2,4,6,12,14,16,17,18,20,21], 2011:[3,4,5,6,8,12,13,16,19,20,21],
  2012:[2,12,13,14,17,18,20,21,22,23], 2013:[3,8,14,15,18],
  2014:[4,8,19,20,21], 2015:[2,3,6,8,10,17,20,21,22],
  2016:[1,5,13,14,16,17,19,20,21,22,23],
}

class Math2Tests(unittest.TestCase):
    def test_complete_catalog_has_ordered_positive_crop_bounds(self):
        for year in range(2010,2027):
            count=23 if year<=2020 else 22
            for kind in ['exams','answers']:
                anchors=CATALOG[kind][str(year)]['anchors']
                self.assertEqual([a[0] for a in anchors],list(range(1,count+1)))
                self.assertEqual(anchors,sorted(anchors,key=lambda a:(a[1],a[2])))
            for n in range(1,count+1):
                for p,b in question_parts(year,n)+answer_parts(year,n):
                    self.assertGreater(b[3],b[1]);self.assertGreaterEqual(b[1],0);self.assertLessEqual(b[3],1)

    @unittest.skipUnless(SOURCE.exists(),'Local source PDF not available')
    def test_checked_marks_merge_to_62_whole_questions_and_append_stably(self):
        with fitz.open(SOURCE) as d:
            self.assertEqual(source_fingerprint(d),FINGERPRINT)
            selected,issues,evidence=select_marks(d)
            self.assertFalse(issues)
            self.assertEqual(sorted(selected),[(y,n) for y,ns in EXPECTED.items() for n in ns])
            self.assertEqual(len(evidence),73)
            p=d[1];p.add_ink_annot([[(.10*p.rect.width,.282*p.rect.height),(.145*p.rect.width,.292*p.rect.height)]]).set_colors(stroke=(1,0,0))
            self.assertEqual(source_fingerprint(d),FINGERPRINT)
            added,issues,_=select_marks(d)
            self.assertFalse(issues);self.assertEqual(set(added)-set(selected),{(2010,3)})

    @unittest.skipUnless(ANSWERS.exists(),'Local answer directory not available')
    def test_answer_identity_uses_content_and_detects_duplicate_years(self):
        matches=answer_matches(ANSWERS,source_fingerprint)['matches']
        self.assertEqual(sum(m['status']=='matched' for m in matches),17)
        import shutil
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy2(ANSWERS/'数学二解析2010.pdf',Path(tmp)/'pretend-2025.pdf')
            found=answer_matches(tmp,source_fingerprint)['matches']
            self.assertEqual(next(m for m in found if m['year']==2010)['status'],'matched')
            self.assertEqual(next(m for m in found if m['year']==2025)['status'],'missing')
            shutil.copy2(Path(tmp)/'pretend-2025.pdf',Path(tmp)/'copy.pdf')
            found=answer_matches(tmp,source_fingerprint)['matches']
            self.assertEqual(next(m for m in found if m['year']==2010)['status'],'conflict')

    @unittest.skipUnless(SOURCE.exists(),'Local source PDF not available')
    def test_repeat_import_has_no_new_questions_or_rendered_files(self):
        import hashlib
        old=[{'pdfSource':{'sourceFingerprint':FINGERPRINT,'sourceKey':hashlib.sha256(f'{FINGERPRINT}:math2:{y}:{n}'.encode()).hexdigest()[:24]}} for y,ns in EXPECTED.items() for n in ns]
        with tempfile.TemporaryDirectory() as tmp, fitz.open(SOURCE) as d:
            result=extract_math2(d,FINGERPRINT,str(SOURCE),Path(tmp),old,lambda *a:None,str(ANSWERS),source_fingerprint)
            self.assertEqual(result['questions'],[]);self.assertEqual(result['duplicates'],62)
            self.assertEqual(list(Path(tmp).iterdir()),[])

if __name__=='__main__':unittest.main()
