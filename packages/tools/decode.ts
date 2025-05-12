class DecoderError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

interface DecoderFn<T> {
    (thing: unknown): T | DecoderError;
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
    return defineDecoder<O>((thing: unknown) => {
        if (!thing || typeof thing !== "object") {
            return new DecoderError("is not object");
        }
        try {
            const value = innerDecoder({
                field: (fieldName, decoder) => {
                    if (!isKeyOf(thing, fieldName)) {
                        throw new DecoderError(`is missing "${fieldName}"`);
                    }
                    const result = decoder(thing[fieldName]);
                    if (result instanceof DecoderError) {
                        throw new DecoderError(`has wrong "${fieldName}", it \n${result.message}`);
                    }
                    return result;
                },
            });
            return value;
        } catch (er) {
            if (er instanceof DecoderError) {
                return er;
            } else {
                return new DecoderError("threw", { cause: er });
            }
        }
    });
}

export function array<T>(decoder: Decoder<T>): Decoder<T[]> {
    return defineDecoder<T[]>((thing: unknown) => {
        if (!Array.isArray(thing)) {
            return new DecoderError("is not array");
        }
        const output: T[] = [];
        for (let i = 0; i < thing.length; i++) {
            if (!(i in thing)) {
                return new DecoderError(`has empty slot at ${i}`);
            }
            const item = thing[i];
            const result = decoder(item);
            if (result instanceof DecoderError) {
                return new DecoderError(`has wrong "${i}", it \n${result.message}`);
            } else {
                output.push(result);
            }
        }
        return output;
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
            return thing as BaseTypeMap[N];
        } else {
            return new DecoderError(`is not ${primitiveName}`);
        }
    });
}

export const number = ofType("number");
export const string = ofType("string");
export const boolean = ofType("boolean");

export function decodes<T>(decoder: Decoder<T>) {
    return (thing: unknown): thing is T => {
        return !(decoder(thing) instanceof DecoderError);
    };
}

export function keyOf<T extends Record<keyof any, any>>(object: T): Decoder<keyof T> {
    return defineDecoder<keyof T>((thing: unknown) => {
        if (
            (typeof thing === "string" || typeof thing === "number" || typeof thing === "symbol") &&
            thing in object
        ) {
            return thing as keyof T;
        } else {
            return new DecoderError("not a key");
        }
    });
}

export const isKeyOf = <T extends object>(object: T, maybeKey: PropertyKey): maybeKey is keyof T =>
    maybeKey in object;
