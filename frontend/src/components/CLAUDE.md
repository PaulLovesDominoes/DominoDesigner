### Property editing

`components/PropertiesDialog.tsx` is the standard handler for every DDObject type. It owns the
dialog chrome, dragging, the shared Name field and the Save/Cancel semantics; the type-specific
controls come from `getDDObjectEditor`, so adding a DDObject type never means editing it.

The three pieces relate like this: a type's **`editor.tsx`** is a plain set of rows built from
the reusable controls in **`components/PropertyFields.tsx`** (`TextField`, `NumberField`,
`OptionalNumberField`, `NumberPairField`, `UnitNumberField`, `ColorField`, `SelectField`,
`CheckboxField`, `ReadOnlyField`, `Steppers`, plus `Separator` and `SectionHeader` for grouping)
— it holds no dialog chrome and never imports `PropertiesDialog`. Note the module-private
**`NumberInput`** holds the half-typed-value handling that `NumberField`, `NumberPairField` and
`OptionalNumberField` share; a fourth control wanting a number box should use it rather than
copying the draft logic a fourth time.

Two of those need saying apart, because the difference between them is easy to collapse:

- **`OptionalNumberField` may be left empty, and empty is a value** — it hands back `null`, and
  whoever reads the setting decides what that means. `NumberInput`'s `allowBlank` is what
  distinguishes it from every other box, where an empty box is a *transient editing state* that
  is deliberately never committed (a zero-width plane in the scene, a divide-by-zero in the
  camera's fit). It is a separate control rather than a flag on `NumberField` because an
  optional value returns `number | null`, and widening `NumberField`'s `onChange` to match would
  push that null onto every existing call site to no purpose. Its `placeholder` is how the box
  says what leaving it empty will do — "auto". The print layout's page counts are the case it
  was written for (see *Build plans*).
- **`ReadOnlyField` is never editable at all**, so it renders plain text and takes no
  `onChange`. `NumberField`'s `disabled` covers the neighbouring case — a derived value the
  control *could* have edited, shown in a real (greyed) box. `fieldElement`'s "Total dominoes"
  row is the first user.
**`PropertiesDialog.tsx`** looks the editor up through the
registry (`getDDObjectEditor`) and hosts it, passing each editor an `update` callback wired to
`updateDDObject`. So a new control shared across types is added to `PropertyFields.tsx`; a new
type's editor consumes those controls and is wired only via its own definition.

Editing is a **live preview with commit/rollback**: an editor's `update` writes straight into
the store as the user types — which is what makes the canvas update — and the store holds an
`editingSnapshot` taken when the dialog opened. Save discards the snapshot; Cancel, the close
button and Escape all route through `cancelProperties`, which puts it back. Editors therefore
never buffer a draft of their own (the controls in `PropertyFields.tsx` hold a transient
*string* draft, which is a different thing: it stops a half-typed value like `""` reaching the
scene).

The dialog is deliberately **modeless**. Its scrim covers the viewport at `z-index: 50` and the
canvas area lifts itself above it (`canvasAreaRaised`, `z-index: 60`), so the chrome dims while
the preview stays bright and interactive. Nothing between `.app-content` and `.canvasArea`
establishes a stacking context — keep it that way, or the lift silently stops working.
