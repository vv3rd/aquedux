export function isGenerator(thing: unknown): thing is Generator {
    return (
        thing != null &&
        typeof thing === "object" &&
        Symbol.iterator in thing &&
        "next" in thing &&
        "return" in thing &&
        "throw" in thing
    );
}
