import { lazy, useState, type ComponentType } from "react";

/** Initial public routes can load before mounting without suspending again. */
export function preloadable<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  let loaded: ComponentType<Props> | undefined;
  let pending: Promise<{ default: ComponentType<Props> }> | undefined;
  const prepare = () =>
    (pending ??= load().then((module) => {
      loaded = module.default;
      return module;
    }));
  const Lazy = lazy(prepare);
  function View(props: Props) {
    // Keep the chosen component identity after a lazy load, so parent updates
    // do not remount the page and discard form or pricing selection state.
    const [Component] = useState(() => loaded ?? Lazy);
    return <Component {...props} />;
  }
  return Object.assign(View, {
    preload: async () => {
      await prepare();
    },
  });
}
