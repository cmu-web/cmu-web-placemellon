# Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, commands and technical
details.

## Issues

For a bug report, include the URL or options you used, what happened and
what you expected. Include the browser or runtime version when relevant.
Check existing issues before opening a new one.

For a proposed feature, describe the use case. Discuss larger changes in
an issue before starting the implementation.

## Pull requests

Branch from `main` and open pull requests against `main`. Keep each pull
request focused on one concern, and explain the problem and the resulting
behavior. Include relevant validation results.

Run the [development checks](DEVELOPMENT.md#checks) before submitting.
Enable the [pre-commit hooks](DEVELOPMENT.md#pre-commit-hooks) in your checkout
to run linting, formatting checks and type checking when you commit.
Add or update tests when behavior changes, and update the user documentation
when changing an option or its behavior.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Style

ESLint checks TypeScript and browser JavaScript. Prettier controls
formatting; use the checked-in configuration. See the
[linting and formatting instructions](DEVELOPMENT.md#linting-and-formatting).

For documentation, follow the
[GitHub Docs style guide](https://docs.github.com/en/contributing/style-guide-and-content-model/style-guide).
For general grammar and punctuation, use the
[Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/),
which GitHub uses as its reference.

Edit TypeScript in `src/`; generated files in `dist/` are not committed.
