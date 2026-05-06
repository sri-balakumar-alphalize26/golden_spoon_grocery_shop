// OverlayLoader has been intentionally neutralised — the user asked to remove
// the centred "loading round with percentage" spinner everywhere in the app.
// We keep the named/default export and the same prop signature so the ~70
// caller sites can continue importing/using it without any change; the
// component simply renders nothing.
const OverlayLoader = () => null;

export default OverlayLoader;
