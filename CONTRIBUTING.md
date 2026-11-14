# Contributing

For setup and checks, see [Development](DEVELOPMENT.md). For image URLs and
options, see the [user documentation](https://placemellon.andrew.cmu.edu/).

## Report a Problem

Check existing issues first. Include the image URL or options you used,
what happened and what you expected. Include the browser or runtime
version if it affects the result.

For a feature request, describe the page or workflow it would help.
Discuss larger changes in an issue before starting implementation.

## Submit a Pull Request

Branch from `main` and open the pull request against `main`. Keep it
focused on one concern. Explain the problem, the resulting behavior and
how you checked the change.

Run the [checks](DEVELOPMENT.md#checks) before submitting and enable the
[pre-commit hooks](DEVELOPMENT.md#pre-commit-hooks). Add or update tests
when behavior changes. Update the options reference and builder when
changing a public image option.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
for commit subjects.

## Code and Writing Style

Edit TypeScript in `src/`; `dist/` is generated and is not committed.
Browser scripts live in `docs/js/`. ESLint and Prettier use the checked-in
configuration; see [Linting and Formatting](DEVELOPMENT.md#linting-and-formatting).
One-line code comments are fragments without a period.

Follow the Web Kilt's [writing conventions](https://webkilt.andrew.cmu.edu/0/conventions.html)
for documentation and examples: AP style, Title Case for headings, buttons
and labels, and action verbs at the start of buttons and calls to action.
Use made-up content, gray placeholders or Scotty in examples, and Andrew
Carnegie (ac00) for a person.
