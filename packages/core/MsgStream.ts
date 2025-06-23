import { Is } from "../tools/functions";
import {  Msg } from "./control";

export interface MsgStream<TVal> extends AsyncIterable<Msg> {
    query(checker: (state: TVal) => boolean): Promise<TVal>;
    query<T>(selector: (state: TVal) => T | null | undefined | false): Promise<T>;
    query<U extends TVal>(predicate: (state: TVal) => state is U): Promise<U>;
    query<M extends Msg>(matcher: { match: Is<M> }): Promise<M>;
}
