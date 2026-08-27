import { CheckboxField, SelectField } from "../../../components/PropertyFields";
import type { StructureOperationEditorProps } from "../base";
import RepeatField from "../RepeatField";
import { GRID_GEOMETRIES, GRID_GEOMETRY_LIST } from "./geometries";
import type { GridDefinitionOperation, GridGeometryKind } from "./object-model";
import SpacingField from "./SpacingField";

/**
 * A grid definition's properties: which pattern the junctions fall into, how far
 * apart they are, whether the whole thing is turned, and how many layers it
 * covers.
 *
 * **There is no per-geometry markup here.** Which spacing rows to draw and
 * whether the Expanded tick box means anything are both read off the geometry's
 * own entry in GRID_GEOMETRIES, so adding a pattern is a table entry and this
 * file is not touched.
 *
 * Everything writes straight through to the store on each change, so the dots on
 * the canvas follow as it is typed. The dialog around it owns Create / Update and
 * Cancel, so this holds no draft of its own.
 */
export default function GridDefinitionEditor({
  operation,
  update,
}: StructureOperationEditorProps<GridDefinitionOperation>) {
  const geometry = GRID_GEOMETRIES[operation.geometry];

  return (
    <>
      <SelectField
        label="Grid Geometry"
        value={geometry.label}
        options={GRID_GEOMETRY_LIST.map((kind) => GRID_GEOMETRIES[kind].label)}
        onChange={(label) => {
          const kind = GRID_GEOMETRY_LIST.find(
            (k) => GRID_GEOMETRIES[k].label === label,
          );
          // Both flags go back to off with the geometry. They are answers about
          // a particular pattern — how far apart to push its tiles, and which
          // way round to set it — so carrying them over would land the new
          // geometry in a state nobody chose for it. The spacings are not reset
          // with them: a distance in millimetres means the same thing whichever
          // pattern it is measuring.
          if (kind) {
            update({
              geometry: kind as GridGeometryKind,
              expanded: false,
              rotate45: false,
            });
          }
        }}
      />

      {geometry.spacing === "xy" ? (
        <>
          <SpacingField
            label="Horizontal Spacing (X)"
            spacing={operation.spacingX}
            onChange={(spacingX) => update({ spacingX })}
          />
          <SpacingField
            label="Vertical Spacing (Y)"
            spacing={operation.spacingY}
            onChange={(spacingY) => update({ spacingY })}
          />
        </>
      ) : (
        /*
          The single-spacing geometries are all built from one edge length, and
          it is spacingX that carries it — see object-model.ts, where that
          choice is explained. The user never sees the name "X" here.
        */
        <SpacingField
          label="Segment Length"
          spacing={operation.spacingX}
          onChange={(spacingX) => update({ spacingX })}
        />
      )}

      {/*
        Hidden rather than disabled for a geometry with only one form — there is
        nothing to read off a greyed tick box whose value is not being used. The
        same call the layer editor's Times box makes.
      */}
      {geometry.expandable && (
        <CheckboxField
          label="Expanded"
          value={operation.expanded}
          onChange={(expanded) => update({ expanded })}
        />
      )}

      <CheckboxField
        label="Rotate 45 degrees"
        value={operation.rotate45}
        onChange={(rotate45) => update({ rotate45 })}
      />

      {/*
        Labelled "Layers" rather than "Repeat", which is what the same control
        says in the layer editor. A grid already repeats across the plane in X and
        Y, so a row called Repeat here would be two kinds of repetition told apart
        by context — see object-model.ts.

        Last, because it says where this definition applies rather than what it
        describes, and the rows above are what the user came here to set.
      */}
      <RepeatField
        label="Layers"
        repeat={operation.repeat}
        count={operation.repeatCount}
        onChange={update}
      />
    </>
  );
}