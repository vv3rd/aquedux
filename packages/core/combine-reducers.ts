import { asEntries } from "../tools/objects";
import type { Reducer } from "./definition";
import { createScopedPush } from "./scoping";

type combineReducers = <
    T extends {
        [key in string]: Reducer<any, any>;
    },
>(
    reducersObject: T,
) => Reducer<{
    [K in keyof T]: T[K] extends Reducer<infer TState> ? TState : never;
}>;

export const combineReducers: combineReducers = (reducersObject) => {
    const reducers = asEntries(reducersObject);

    return function combination(current, action, command) {
        let next = current!;
        for (let [key, reducer] of reducers) {
            const scopedCommand = createScopedPush(command, (s) => s[key]);
            const stateWas = current?.[key];
            const stateNow = reducer(stateWas, action, scopedCommand);
            if (stateWas !== stateNow) {
                if (next === current) {
                    next = { ...current };
                }
                next[key] = stateNow;
            }
        }
        return next;
    };
};
