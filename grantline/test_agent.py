import unittest
from datetime import date

from agent import analyze, to_jsonl


TODAY = date(2026, 10, 22)
ORG = {"name": "Harbor", "region": "California", "focus": "food access, youth", "funding_need": 25000}
BASE = {"id": "a", "title": "Food access", "funder": "Test Trust", "source_url": "https://example.org/a", "deadline": "2026-11-30", "regions": "California", "focus": "food access", "amount": 30000, "applicant_types": "Nonprofits"}


class GrantlineTests(unittest.TestCase):
    def test_match_has_source_and_explainable_score(self):
        item = analyze(ORG, [BASE], TODAY)["results"][0]
        self.assertEqual(item["status"], "candidate")
        self.assertEqual(item["score"], 85)
        self.assertEqual(item["evidence"][0]["source_url"], BASE["source_url"])

    def test_excludes_expired_wrong_region_and_duplicate(self):
        expired = dict(BASE, id="b", deadline="2026-10-21")
        wrong_region = dict(BASE, id="c", regions="Oregon")
        report = analyze(ORG, [BASE, expired, wrong_region, BASE], TODAY)
        self.assertEqual((report["candidates"], report["excluded"]), (1, 3))
        self.assertIn("Deadline has passed", report["trace"][1]["rules"])
        self.assertIn("Region is outside stated eligibility", report["trace"][2]["rules"])
        self.assertIn("Duplicate source record", report["trace"][3]["rules"])
        self.assertEqual(len(to_jsonl(report).splitlines()), 4)

    def test_missing_source_cannot_pass(self):
        report = analyze(ORG, [dict(BASE, source_url="")], TODAY)
        self.assertEqual(report["candidates"], 0)
        self.assertIn("Missing title or source URL", report["results"][0]["reasons"])

    def test_unknown_grant_eligibility_requires_review(self):
        record = dict(BASE, regions="", focus="", applicant_types=["Nonprofits"], funding_categories=["Food and Nutrition"])
        report = analyze(ORG, [record], TODAY)
        self.assertEqual((report["candidates"], report["needs_review"], report["excluded"]), (0, 1, 0))
        self.assertIn("Region eligibility needs source review", report["results"][0]["reasons"])
        self.assertEqual(report["results"][0]["evidence"][-1]["value"], ["Food and Nutrition"])

    def test_source_notes_can_advance_a_lead_without_claiming_eligibility(self):
        record = dict(BASE, regions="California", focus="food access", source_note="Eligibility and program summary on source page", reviewed_fields=["regions"])
        report = analyze(ORG, [record], TODAY)
        self.assertEqual(report["candidates"], 1)
        self.assertEqual(report["trace"][0]["source_note"], record["source_note"])
        self.assertEqual(report["results"][0]["evidence"][1]["provenance"], "operator source note")
        self.assertEqual(report["results"][0]["evidence"][2]["provenance"], "imported record")
        self.assertIn("not verified eligibility", report["caution"])

    def test_live_grant_requires_nonprofit_applicant_evidence(self):
        missing = analyze(ORG, [dict(BASE, applicant_types="")], TODAY)["results"][0]
        self.assertEqual(missing["status"], "needs_review")
        self.assertIn("Nonprofit applicant eligibility needs source review", missing["reasons"])
        record = dict(BASE, applicant_types=["Individuals"])
        result = analyze(ORG, [record], TODAY)["results"][0]
        self.assertEqual(result["status"], "excluded")
        self.assertIn("Listed applicant types exclude nonprofits", result["reasons"])
        self.assertEqual(result["score"], 0)
        reviewed = dict(record, applicant_types="Nonprofits", source_note="Applicant eligibility section of original notice", reviewed_fields=["applicant_types"])
        self.assertEqual(analyze(ORG, [reviewed], TODAY)["results"][0]["status"], "candidate")
        self.assertEqual(analyze(ORG, [reviewed], TODAY)["results"][0]["evidence"][4]["provenance"], "operator source note")

    def test_organization_must_be_complete(self):
        with self.assertRaises(ValueError):
            analyze(dict(ORG, funding_need=0), [BASE], TODAY)

    def test_other_applicants_need_source_review(self):
        record = dict(BASE, applicant_types=['Others (see text field entitled "Additional Information on Eligibility" for clarification)'])
        result = analyze(ORG, [record], TODAY)["results"][0]
        self.assertEqual(result["status"], "needs_review")
        self.assertIn("Nonprofit applicant eligibility needs source review", result["reasons"])
        self.assertNotIn("Listed applicant types exclude nonprofits", result["reasons"])


if __name__ == "__main__":
    unittest.main()
