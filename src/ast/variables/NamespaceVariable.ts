import type Module from '../../Module';
import type { AstContext } from '../../Module';
import { getToStringTagValue, MERGE_NAMESPACES_VARIABLE } from '../../utils/interopHelpers';
import type { RenderOptions } from '../../utils/renderHelpers';
import { getSystemExportStatement } from '../../utils/systemJsRendering';
import type { HasEffectsContext } from '../ExecutionContext';
import { INTERACTION_ASSIGNED, INTERACTION_CALLED } from '../NodeInteractions';
import type { NodeInteraction, NodeInteractionWithThisArgument } from '../NodeInteractions';
import type Identifier from '../nodes/Identifier';
import type { LiteralValueOrUnknown } from '../nodes/shared/Expression';
import { UnknownValue } from '../nodes/shared/Expression';
import type ChildScope from '../scopes/ChildScope';
import type { ObjectPath, PathTracker } from '../utils/PathTracker';
import { SymbolToStringTag, UNKNOWN_PATH } from '../utils/PathTracker';
import Variable from './Variable';

export default class NamespaceVariable extends Variable {
	context: AstContext;
	declare isNamespace: true;
	module: Module;

	private memberVariables: { [name: string]: Variable } | null = null;
	private mergedNamespaces: readonly Variable[] = [];
	private referencedEarly = false;
	private references: Identifier[] = [];

	constructor(context: AstContext) {
		super(context.getModuleName());
		this.context = context;
		this.module = context.module;
	}

	addReference(identifier: Identifier): void {
		this.references.push(identifier);
		this.name = identifier.name;
	}

	deoptimizePath(path: ObjectPath) {
		if (path.length > 1) {
			const key = path[0];
			if (typeof key === 'string') {
				this.getMemberVariables()[key]?.deoptimizePath(path.slice(1));
			}
		}
	}

	deoptimizeThisOnInteractionAtPath(
		interaction: NodeInteractionWithThisArgument,
		path: ObjectPath,
		recursionTracker: PathTracker
	) {
		if (path.length > 1 || (path.length === 1 && interaction.type === INTERACTION_CALLED)) {
			const key = path[0];
			if (typeof key === 'string') {
				this.getMemberVariables()[key]?.deoptimizeThisOnInteractionAtPath(
					interaction,
					path.slice(1),
					recursionTracker
				);
			} else {
				interaction.thisArg.deoptimizePath(UNKNOWN_PATH);
			}
		}
	}

	getLiteralValueAtPath(path: ObjectPath): LiteralValueOrUnknown {
		if (path[0] === SymbolToStringTag) {
			return 'Module';
		}
		return UnknownValue;
	}

	getMemberVariables(): { [name: string]: Variable } {
		if (this.memberVariables) {
			return this.memberVariables;
		}
		const memberVariables: { [name: string]: Variable } = Object.create(null);
		for (const name of [...this.context.getExports(), ...this.context.getReexports()]) {
			if (name[0] !== '*' && name !== this.module.info.syntheticNamedExports) {
				const exportedVariable = this.context.traceExport(name);
				if (exportedVariable) {
					memberVariables[name] = exportedVariable;
				}
			}
		}
		return (this.memberVariables = memberVariables);
	}

	hasEffectsOnInteractionAtPath(
		path: ObjectPath,
		interaction: NodeInteraction,
		context: HasEffectsContext
	): boolean {
		const { type } = interaction;
		if (path.length === 0) {
			// This can only be a call anyway
			return true;
		}
		if (path.length === 1 && type !== INTERACTION_CALLED) {
			return type === INTERACTION_ASSIGNED;
		}
		const key = path[0];
		if (typeof key !== 'string') {
			return true;
		}
		const memberVariable = this.getMemberVariables()[key];
		return (
			!memberVariable ||
			memberVariable.hasEffectsOnInteractionAtPath(path.slice(1), interaction, context)
		);
	}

	include(): void {
		this.included = true;
		this.context.includeAllExports();
	}

	prepare(accessedGlobalsByScope: Map<ChildScope, Set<string>>): void {
		if (this.mergedNamespaces.length > 0) {
			this.module.scope.addAccessedGlobals([MERGE_NAMESPACES_VARIABLE], accessedGlobalsByScope);
		}
	}

	renderBlock(options: RenderOptions): string {
		const {
			exportNamesByVariable,
			format,
			freeze,
			indent: t,
			namespaceToStringTag,
			snippets: { _, cnst, getObject, getPropertyAccess, n, s }
		} = options;
		const memberVariables = this.getMemberVariables();
		const members: [key: string | null, value: string][] = Object.entries(memberVariables).map(
			([name, original]) => {
				if (this.referencedEarly || original.isReassigned) {
					return [
						null,
						`get ${name}${_}()${_}{${_}return ${original.getName(getPropertyAccess)}${s}${_}}`
					];
				}

				return [name, original.getName(getPropertyAccess)];
			}
		);
		members.unshift([null, `__proto__:${_}null`]);

		let output = getObject(members, { lineBreakIndent: { base: '', t } });
		if (this.mergedNamespaces.length > 0) {
			const assignmentArguments = this.mergedNamespaces.map(variable =>
				variable.getName(getPropertyAccess)
			);
			output = `/*#__PURE__*/${MERGE_NAMESPACES_VARIABLE}(${output},${_}[${assignmentArguments.join(
				`,${_}`
			)}])`;
		} else {
			// The helper to merge namespaces will also take care of freezing and toStringTag
			if (namespaceToStringTag) {
				output = `/*#__PURE__*/Object.defineProperty(${output},${_}Symbol.toStringTag,${_}${getToStringTagValue(
					getObject
				)})`;
			}
			if (freeze) {
				output = `/*#__PURE__*/Object.freeze(${output})`;
			}
		}

		const name = this.getName(getPropertyAccess);
		output = `${cnst} ${name}${_}=${_}${output};`;

		if (format === 'system' && exportNamesByVariable.has(this)) {
			output += `${n}${getSystemExportStatement([this], options)};`;
		}

		return output;
	}

	renderFirst(): boolean {
		return this.referencedEarly;
	}

	setMergedNamespaces(mergedNamespaces: readonly Variable[]): void {
		this.mergedNamespaces = mergedNamespaces;
		const moduleExecIndex = this.context.getModuleExecIndex();
		for (const identifier of this.references) {
			if (identifier.context.getModuleExecIndex() <= moduleExecIndex) {
				this.referencedEarly = true;
				break;
			}
		}
	}
}

NamespaceVariable.prototype.isNamespace = true;
