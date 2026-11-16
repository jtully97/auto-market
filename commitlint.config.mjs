/**
 * Conventional Commits are enforced locally (husky commit-msg hook) and in CI.
 * The commit type drives semantic versioning via release-please:
 *   fix: -> patch, feat: -> minor, feat!: / BREAKING CHANGE: -> major.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'web',
        'shared',
        'worker',
        'db',
        'ai',
        'billing',
        'social',
        'email',
        'analytics',
        'infra',
        'ci',
        'deps',
        'docs',
        'release',
      ],
    ],
    'body-max-line-length': [0],
  },
};
