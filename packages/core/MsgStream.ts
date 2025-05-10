import { Is } from "../tools/functions";
import {  Msg } from "./control";

export interface MsgStream<TState> extends AsyncIterable<Msg> {
    query(checker: (state: TState) => boolean): Promise<TState>;
    query<T>(selector: (state: TState) => T | null | undefined | false): Promise<T>;
    query<U extends TState>(predicate: (state: TState) => state is U): Promise<U>;
    query<M extends Msg>(matcher: { match: Is<M> }): Promise<M>;
}
