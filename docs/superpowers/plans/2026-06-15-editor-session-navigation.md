# Editor Session Navigation Implementation Plan

## Goal

Make the root workbench (`/`) support a reversible editor session. After opening or creating a document, browser Back and an explicit UI action should return to the workbench instead of leaving the user trapped on the same route.

## Scope

- Current 7.x branch behavior only.
- Do not change OnlyOffice loading, conversion, or 9.3 upgrade exploration code.
- Keep `/` as the public workbench route.
- Use `/#editor` as a lightweight history marker for the active editor session.
- Preserve iframe embed mode behavior by avoiding local history ownership when `?embed=1`.

## Steps

1. Add focused unit tests for editor session state:
   - entering editing pushes `#editor` and hides the workbench;
   - browser Back closes the editor and shows the workbench;
   - failed open clears the editor container and restores the workbench;
   - embed mode does not push `#editor`.
2. Implement `src/lib/editor-session.ts`:
   - expose `initEditorSession`, `beginEditorOpening`, `commitEditorOpen`, `failEditorOpen`, `closeEditorSession`, and `isEditorSessionOpen`;
   - own teardown of `window.editor` and `#iframe`;
   - coordinate workbench visibility callbacks.
3. Integrate with document flows:
   - call `beginEditorOpening()` before new/open/url operations hide the workbench;
   - call `commitEditorOpen()` after successful editor creation;
   - call `failEditorOpen()` when open/create fails.
4. Integrate app shell:
   - initialize the session from `src/index.ts`;
   - add a menu action for returning to the workbench.
5. Verify:
   - run the new unit tests;
   - run existing editor tests touched by the prior file-open fix;
   - run production build.
