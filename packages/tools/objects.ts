import { Fn } from "./functions";
import { primitive } from "./ts";

const { prototype, getPrototypeOf } = Object;

export function match<const T extends object>(
    thing: unknown,
    schema: T,
): thing is typeof thing & T {
    if (typeof thing !== "object" || !thing) {
        return false;
    }
    for (const [key, value] of Object.entries(schema)) {
        if ((thing as any)[key] !== value) {
            return false;
        }
    }
    return true;
}

export function isPlainObject(thing: any): thing is { [key: PropertyKey]: unknown } {
    if (!thing) return false;
    return getPrototypeOf(thing) === prototype || getPrototypeOf(thing) === null;
}

export function hash(object: object) {
    return JSON.stringify(object, (_, original) => {
        if (isPlainObject(original)) {
            const keys = Object.keys(original).sort();
            const sorted: any = {};
            for (const key of keys) {
                sorted[key] = original[key];
            }
            return sorted;
        } else {
            return original;
        }
    });
}

export type Immutable<T> = T extends primitive | Fn.Any
    ? T
    : T extends Array<infer U>
      ? ImmutableArray<U>
      : ImmutableObject<T>;

type ImmutableArray<T> = ReadonlyArray<Immutable<T>>;
type ImmutableObject<T> = { readonly [K in keyof T]: Immutable<T[K]> };

