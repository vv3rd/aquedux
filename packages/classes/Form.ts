interface Note {
    level: number;
    text: string;
}

export type CheckResult = undefined | void | string | Note;

export namespace Field {
    export type State<TValue> = {
        modifiedAt: Form.SubmitAttempt;
        focusedAt: Form.SubmitAttempt;
        blurredAt: Form.SubmitAttempt;
        isValidating: boolean;
        isActive: boolean;
        name: string;
        value: TValue;
        notes: Note[];
    };
}

export namespace Form {
    export type SubmitAttempt = number;

    export type State<TValues extends Values> = {
        isValidating: boolean;
        isSubmitting: boolean;
        submitAttempt: SubmitAttempt;
        initialFields: FieldsState<TValues>;
        fields: FieldsState<TValues>;
        notes: NonNullable<CheckNotes<TValues>>;
    };

    export type FieldsState<TFields> = {
        [K in keyof TFields]: Field.State<TFields[K]>;
    };

    export type Values = {
        readonly [key: string]: any;
    };

    export type CheckNotes<TValues> = {
        [K in keyof TValues]?: CheckResult;
    };
}
