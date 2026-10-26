/** Hold only the analytics INSERT; authentication, billing reads and fulfillment still use D1. */
export function pauseAnalyticsWrites(db: D1Database) {
  let release!: (error?: Error) => void;
  let markStarted!: () => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = (error) => (error ? reject(error) : resolve());
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
        if (key === "run")
          return async () => {
            markStarted();
            await gate;
            return target.run();
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  const database = new Proxy(db, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => {
          const statement = target.prepare(sql);
          return /INSERT INTO funnel_events\b/.test(sql) ? wrap(statement) : statement;
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { database, started, release };
}
