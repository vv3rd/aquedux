type Result<T, E> = Ok<T> | Er<E>;

class Ok<T> {
    ok: T;
    er = null;
    constructor(value: T) {
        this.ok = value;
    }
}

class Er<E> {
    ok = null;
    er: E;
    constructor(error: E) {
        this.er = error;
    }
}

class DecoderError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

interface DecoderFn<T> {
    (thing: unknown): Result<T, DecoderError>;
}

interface Decoder<T> extends DecoderFn<T> {
    infer: T;
}

function defineDecoder<T>(decoder: DecoderFn<T>) {
    return decoder as Decoder<T>;
}

export function object<O>(
    innerDecoder: (boundDecoderTools: {
        field: <T>(fieldName: string | number, decoder: Decoder<T>) => T;
    }) => O,
): Decoder<O> {
    return defineDecoder((thing: unknown): Result<O, DecoderError> => {
        if (!thing || typeof thing !== "object") {
            return new Er(new DecoderError("is not object"));
        }
        try {
            const value = innerDecoder({
                field: (fieldName, decoder) => {
                    if (!isKeyOf(thing, fieldName)) {
                        throw new DecoderError(`is missing "${fieldName}"`);
                    }
                    const result = decoder(thing[fieldName]);
                    if (result.er !== null) {
                        throw new DecoderError(
                            `has wrong "${fieldName}", it \n${result.er.message}`,
                        );
                    }
                    return result.ok;
                },
            });
            return new Ok(value);
        } catch (er) {
            if (er instanceof DecoderError) {
                return new Er(er);
            } else {
                return new Er(new DecoderError("threw", { cause: er }));
            }
        }
    });
}

export function array<T>(decoder: Decoder<T>): Decoder<T[]> {
    return defineDecoder((thing: unknown): Result<T[], DecoderError> => {
        if (!Array.isArray(thing)) {
            return new Er(new DecoderError("is not array"));
        }
        const output: T[] = [];
        for (let i = 0; i < thing.length; i++) {
            if (!(i in thing)) {
                return new Er(new DecoderError(`has empty slot at ${i}`));
            }
            const item = thing[i];
            const result = decoder(item);
            if (result.er !== null) {
                return new Er(new DecoderError(`has wrong "${i}", it \n${result.er.message}`));
            } else {
                output.push(result.ok);
            }
        }
        return new Ok(output);
    });
}

type BaseTypeName =
    | "string"
    | "number"
    | "bigint"
    | "object"
    | "function"
    | "boolean"
    | "symbol"
    | "undefined";

type BaseTypeMap = {
    string: string;
    number: number;
    bigint: bigint;
    object: Record<keyof any, unknown>;
    function: (...args: any[]) => unknown;
    boolean: boolean;
    symbol: symbol;
    undefined: undefined;
};

export function ofType<N extends BaseTypeName>(primitiveName: N): Decoder<BaseTypeMap[N]> {
    return defineDecoder((thing: unknown) => {
        if (typeof thing === primitiveName) {
            return new Ok(thing as BaseTypeMap[N]);
        } else {
            return new Er(new DecoderError(`is not ${primitiveName}`));
        }
    });
}

export const number = ofType("number");
export const string = ofType("string");
export const boolean = ofType("boolean");

export function decodes<T>(decoder: Decoder<T>) {
    return (thing: unknown): thing is T => {
        return decoder(thing).er === null;
    };
}

export function keyOf<T extends Record<keyof any, any>>(object: T): Decoder<keyof T> {
    return defineDecoder((thing: unknown): Result<keyof T, DecoderError> => {
        if (
            (typeof thing === "string" || typeof thing === "number" || typeof thing === "symbol") &&
            thing in object
        ) {
            return new Ok(thing as keyof T);
        } else {
            return new Er(new DecoderError("not a key"));
        }
    });
}

export const isKeyOf = <T extends object>(object: T, maybeKey: PropertyKey): maybeKey is keyof T =>
    maybeKey in object;
