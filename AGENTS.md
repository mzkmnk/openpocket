# AGENTS

## TSDoc Rule (English + Japanese)

When adding or updating TypeScript TSDoc comments, always write them in both English and Japanese.

- Keep standard TSDoc tags like `@param` and `@returns`.
- Put English first, then Japanese on the next line(s).
- Apply this rule to public functions, methods, and exported types where documentation is needed.

Example:

```ts
/**
 * Validates settlement window for JP-specific trading rules.
 * 日本向けの約定処理ルールに基づいて、決済可能な時間帯かどうかを検証します。
 *
 * @param order - The order to validate.
 *                検証対象の注文。
 * @param now   - Current date-time.
 *                現在時刻。
 * @returns True if the order can be settled now, otherwise false.
 *          現在の時刻で決済可能な場合は true、それ以外は false。
 */
function validateSettlement(order: Order, now: Date): boolean {
  // ...
}
```

## PR Description Rule (English + Japanese Accordion)

When writing pull request descriptions, always write the main content in English, and include the Japanese version inside an accordion (`<details>` block).

- Keep English as the primary body text.
- Add a `## Japanese` section using `<details>` and `<summary>Japanese</summary>`.
- Ensure the Japanese content matches the English content in meaning.

Example:

```md
## Summary

- Add validation for settlement windows.
- Update unit tests for JP-specific cases.

<details>
<summary>Japanese</summary>

## 日本語

- 決済可能時間帯のバリデーションを追加。
- 日本向けケースのユニットテストを更新。

</details>
```
