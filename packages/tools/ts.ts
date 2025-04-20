export type Real = NonNullable<unknown>;
export type Dict<T> = Record<string, T>;

export type Falsy = null | undefined | false | "" | 0 | 0n;
export type Pretty<T> = { [K in keyof T]: T[K] } & {};

export type PromiseOr<T> = T | Promise<T>;

export type primitive = undefined | null | boolean | string | number | symbol | bigint;
