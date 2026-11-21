# Contributing

Casebook is a public experiment, so the most useful contribution is a check.

## A key that looks wrong

Every key on an hour page links its evidence. If the chain says something else, open a
[key report](https://github.com/casebookduel/casebook/issues/new?template=key.yml) with the hour, the question and what
the chain shows. Graded hours are sealed, so a report is answered on the issue; the record itself does not change.

## Code

1. For anything bigger than a small fix, open an issue first, so we agree on the change before you write it.
2. One change per pull request, with a test when the change has logic.
3. Run the checks for the part you touched:

   ```sh
   cd engine && npm ci && npm test
   cd site && npm ci && npm run lint && npm test && npm run build
   cd chain && forge test
   python3 -m unittest m1/test_lessons.py m1/test_league.py
   ```

4. Say why in the commit message, not only what.

The runner's questions and keys (`m1/duel.py`) decide the record, so a change there also needs a passing
`python3 m1/duel.py check`, which derives every level-2 and level-3 key a second way from the live chain.
