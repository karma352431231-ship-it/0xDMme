import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'fusion_policy', ROOT / 'infra/public-moderation/fusion_policy.py')
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)


def context(**changes):
    view = {
        'covered': 0.5, 'exposed_anatomy': 0.2, 'painting_nudity': 0.1,
        'sex_act': 0.15, 'simulated_act_pose': 0.1, 'ordinary_clothed': -1,
        'style_painting': 0.2, 'style_photo': 0.6, 'style_illustration': 0.2,
    }
    return view | changes


def generic(porn=0.02, hentai=0.01):
    return {'safe': 1 - porn - hentai, 'porn': porn, 'hentai': hentai,
            'sexy': 0, 'drawing': 0}


class FusionPolicyTests(unittest.TestCase):
    def test_bounded_generic_disagreement_with_consistently_covered_context_is_allowed(self):
        # Synthetic regression for miniature-induced generic scores. No case IDs or labels.
        covered = context(exposed_anatomy=0.478, simulated_act_pose=0.474)
        self.assertEqual(policy.classify([covered] * 2, [generic(0.9)] * 2)['verdict'], 'allow')
        for views, nano in (
                ([covered, context(exposed_anatomy=0.485)], [generic(0.9)] * 2),
                ([covered] * 2, [generic(0.95)] * 2),
                ([covered] * 2, [generic(0.96)] * 2)):
            with self.subTest(views=views, nano=nano):
                self.assertEqual(policy.classify(views, nano)['verdict'], 'hold')

    def test_covered_baseline_requires_both_negative_context_and_bounded_generic_score(self):
        covered = context(sex_act=0.4955)
        self.assertEqual(policy.classify([covered] * 2, [generic(0.36)] * 2)['verdict'], 'allow')
        for view, nano in ((context(sex_act=0.497), generic(0.36)),
                           (covered, generic(0.5)),
                           (context(sex_act=0.501), generic(0.01))):
            with self.subTest(view=view, nano=nano):
                self.assertEqual(policy.classify([view] * 2, [nano] * 2)['verdict'], 'hold')

    def test_painting_exception_needs_consistent_style_and_anatomy_evidence(self):
        painted = context(painting_nudity=0.75, exposed_anatomy=0.8,
                          style_painting=0.7, style_photo=0.2)
        for other in (painted | {'style_illustration': 0.69},
                      painted | {'painting_nudity': 0.4}):
            self.assertNotEqual(policy.classify([painted, other], [generic(0.9)] * 2)['verdict'], 'allow')

    def test_moderate_generic_score_does_not_block_consistently_covered_views(self):
        covered = context(exposed_anatomy=0.491, sex_act=0.494,
                          simulated_act_pose=1)
        self.assertEqual(policy.classify([covered] * 2, [generic(0.47)] * 2)['verdict'], 'allow')
        for view, nano in ((covered, generic(0.5)),
                           (covered | {'sex_act': 0.501}, generic(0.47)),
                           (covered | {'exposed_anatomy': 0.501}, generic(0.47))):
            with self.subTest(view=view, nano=nano):
                self.assertEqual(policy.classify([view] * 2, [nano] * 2)['verdict'], 'hold')

    def test_pose_scores_do_not_decide_permission_or_rejection(self):
        for count in (2, 4):
            for pose in (-1, 0, 0.8, 1):
                with self.subTest(count=count, pose=pose):
                    covered = context(simulated_act_pose=pose)
                    self.assertEqual(policy.classify([covered] * count, [generic()] * count)['verdict'], 'allow')
                    explicit = covered | {'sex_act': 0.8}
                    self.assertEqual(policy.classify([explicit] * count, [generic()] * count)['verdict'], 'reject')

    def test_one_suspicious_view_prevents_permission_without_punitive_consensus(self):
        views = [context(), context(sex_act=0.8)]
        self.assertEqual(policy.classify(views, [generic()] * 2)['verdict'], 'hold')

    def test_generic_disagreement_only_yields_to_strong_consistent_negative_context(self):
        self.assertEqual(policy.classify([context()] * 2, [generic(0.7)] * 2)['verdict'], 'allow')
        for views, nano in (
                ([context(), context(sex_act=0.49)], [generic(0.7)] * 2),
                ([context()] * 2, [generic(0.99)] * 2)):
            self.assertEqual(policy.classify(views, nano)['verdict'], 'hold')

    def test_weak_negative_context_requires_low_generic_score_and_never_allows_a_tie(self):
        negative = context(sex_act=0.499)
        self.assertEqual(policy.classify([negative] * 2, [generic(0.001, 0)] * 2)['verdict'], 'allow')
        for view, nano in ((negative, generic(0.3)),
                           (context(sex_act=0.5), generic(0.001, 0)),
                           (context(sex_act=0.501), generic(0.001, 0))):
            self.assertEqual(policy.classify([view] * 2, [nano] * 2)['verdict'], 'hold')

    def test_painting_exempts_anatomy_and_pose_but_not_visible_actual_acts(self):
        painting = context(painting_nudity=0.75, exposed_anatomy=0.8,
                           style_painting=0.7, style_photo=0.2, simulated_act_pose=0.99)
        self.assertEqual(policy.classify([painting] * 2, [generic(0.99)] * 2)['verdict'], 'allow')
        explicit = painting | {'sex_act': 0.9}
        self.assertEqual(policy.classify([explicit] * 2, [generic(0.99)] * 2)['verdict'], 'reject')

    def test_corroborated_exposed_anatomy_is_rejected(self):
        view = context(exposed_anatomy=0.65)
        self.assertEqual(policy.classify([view] * 2, [generic(0.99)] * 2)['verdict'], 'reject')

    def test_ordinary_clothed_scene_can_resolve_weak_semantic_false_positive(self):
        view = context(covered=0.2, sex_act=0.23, exposed_anatomy=0.22,
                       ordinary_clothed=0.26)
        result = policy.classify([view] * 2, [generic(0.57)] * 2)
        self.assertEqual(result['verdict'], 'allow')
        self.assertGreater(min(result['margins']), 0)
        self.assertLess(max(result['permission_margins']), -0.02)

    def test_clothed_similarity_never_weakens_actual_act_or_corroborated_nudity_rejection(self):
        for ordinary in (-1, 0.5, 1):
            with self.subTest(ordinary=ordinary):
                act = context(sex_act=0.8, ordinary_clothed=ordinary)
                self.assertEqual(policy.classify([act] * 2, [generic()] * 2)['verdict'], 'reject')
                anatomy = context(exposed_anatomy=0.65, ordinary_clothed=ordinary)
                self.assertEqual(policy.classify([anatomy] * 2, [generic(0.99)] * 2)['verdict'], 'reject')

    def test_clothed_permission_needs_complete_consistent_views_and_bounded_generic_score(self):
        ordinary = context(covered=0.2, sex_act=0.23, exposed_anatomy=0.22,
                           ordinary_clothed=0.26)
        weak = ordinary | {'ordinary_clothed': 0.23}
        self.assertEqual(policy.classify([ordinary, weak], [generic(0.57)] * 2)['verdict'], 'hold')
        self.assertEqual(policy.classify([ordinary] * 2, [generic(0.99)] * 2)['verdict'], 'reject')
        malformed = ordinary | {'ordinary_clothed': float('nan')}
        with self.assertRaises(ValueError):
            policy.classify([malformed] * 2, [generic()] * 2)

    def test_incomplete_nonfinite_or_invalid_probability_evidence_never_gets_a_verdict(self):
        invalid_contexts = [context(covered=True), context(sex_act=float('nan')),
                            context(simulated_act_pose=float('inf')), context(exposed_anatomy=2)]
        for invalid in invalid_contexts:
            with self.assertRaises(ValueError):
                policy.classify([invalid] * 2, [generic()] * 2)
        for views, nano in (([context()], [generic()]), ([context()] * 2, [generic()]),
                            ([context()] * 2, [generic() | {'safe': 0.99}] * 2),
                            ([{}] * 2, [generic()] * 2)):
            with self.assertRaises(ValueError):
                policy.classify(views, nano)


if __name__ == '__main__':
    unittest.main()
