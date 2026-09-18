type NotesBaseFormulaResult = {
    supported: true;
    value: unknown;
} | {
    supported: false;
};
type NotesBaseFormulaResolver = (property: string) => unknown;
type NotesBaseFormulaCall = {
    receiver: string;
    args: string;
};
type NotesBaseFormulaOperandEvaluator = (operand: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult;
type NotesBaseFormulaDateTimestamp = (value: unknown, operand: string) => number | null;
type NotesBaseFormulaFileOperandPath = (value: unknown, operand: string) => string | null;
type NotesBaseFormulaDateOffset = (timestamp: number, value: unknown, operand: string, operator: "+" | "-") => number | null;
type NotesBaseFormulaOperandSafety = (operand: string) => boolean;
export declare function isNotesBaseDateOffsetExpression(expression: string, isDateOperand: (operand: string) => boolean): boolean;
export declare function isNotesBaseDurationScaleExpression(expression: string, isDurationOperand: (operand: string) => boolean): boolean;
export declare function evaluateNotesBaseComparison(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator, dateTimestamp?: NotesBaseFormulaDateTimestamp, fileOperandPath?: NotesBaseFormulaFileOperandPath): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseBooleanNot(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseUnaryNumeric(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator, rejectOperand: (operator: "+" | "-", operand: string) => boolean): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseBooleanAnd(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator, isOperandSafe?: NotesBaseFormulaOperandSafety): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseBooleanOr(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator, isOperandSafe?: NotesBaseFormulaOperandSafety): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseAdditive(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator, dateTimestamp?: NotesBaseFormulaDateTimestamp, dateOffset?: NotesBaseFormulaDateOffset): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseMultiplicative(expression: string, resolveProperty: NotesBaseFormulaResolver, evaluateOperand: NotesBaseFormulaOperandEvaluator): NotesBaseFormulaResult | null;
export declare function evaluateNotesBaseNumberTransform(call: NotesBaseFormulaCall, resolveProperty: NotesBaseFormulaResolver, splitArgs: (args: string) => string[] | null, evaluateOperand: NotesBaseFormulaOperandEvaluator, transform: (source: number) => number): NotesBaseFormulaResult;
export {};
//# sourceMappingURL=NotesBaseFormulaArithmetic.d.ts.map