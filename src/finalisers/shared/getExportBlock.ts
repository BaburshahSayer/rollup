import type { ChunkDependency, ChunkExports } from '../../Chunk';
import type { GetInterop } from '../../rollup/types';
import type { GenerateCodeSnippets } from '../../utils/generateCodeSnippets';
import {
	defaultInteropHelpersByInteropType,
	getToStringTagValue,
	isDefaultAProperty,
	namespaceInteropHelpersByInteropType
} from '../../utils/interopHelpers';

export function getExportBlock(
	exports: ChunkExports,
	dependencies: ChunkDependency[],
	namedExportsMode: boolean,
	interop: GetInterop,
	snippets: GenerateCodeSnippets,
	t: string,
	externalLiveBindings: boolean,
	mechanism = 'return '
): string {
	const { _, cnst, getDirectReturnFunction, getFunctionIntro, getPropertyAccess, n, s } = snippets;
	if (!namedExportsMode) {
		return `${n}${n}${mechanism}${getSingleDefaultExport(
			exports,
			dependencies,
			interop,
			externalLiveBindings,
			getPropertyAccess
		)};`;
	}

	let exportBlock = '';

	for (const {
		defaultVariableName,
		importPath,
		isChunk,
		name,
		namedExportsMode: depNamedExportsMode,
		namespaceVariableName,
		reexports
	} of dependencies) {
		if (reexports && namedExportsMode) {
			for (const specifier of reexports) {
				if (specifier.reexported !== '*') {
					const importName = getReexportedImportName(
						name,
						specifier.imported,
						depNamedExportsMode,
						isChunk,
						defaultVariableName!,
						namespaceVariableName!,
						interop,
						importPath,
						externalLiveBindings,
						getPropertyAccess
					);
					if (exportBlock) exportBlock += n;
					if (specifier.imported !== '*' && specifier.needsLiveBinding) {
						const [left, right] = getDirectReturnFunction([], {
							functionReturn: true,
							lineBreakIndent: null,
							name: null
						});
						exportBlock +=
							`Object.defineProperty(exports,${_}'${specifier.reexported}',${_}{${n}` +
							`${t}enumerable:${_}true,${n}` +
							`${t}get:${_}${left}${importName}${right}${n}});`;
					} else {
						exportBlock += `exports${getPropertyAccess(
							specifier.reexported
						)}${_}=${_}${importName};`;
					}
				}
			}
		}
	}

	for (const { exported, local } of exports) {
		const lhs = `exports${getPropertyAccess(exported)}`;
		const rhs = local;
		if (lhs !== rhs) {
			if (exportBlock) exportBlock += n;
			exportBlock += `${lhs}${_}=${_}${rhs};`;
		}
	}

	for (const { name, reexports } of dependencies) {
		if (reexports && namedExportsMode) {
			for (const specifier of reexports) {
				if (specifier.reexported === '*') {
					if (exportBlock) exportBlock += n;
					const copyPropertyIfNecessary = `{${n}${t}if${_}(k${_}!==${_}'default'${_}&&${_}!exports.hasOwnProperty(k))${_}${getDefineProperty(
						name,
						specifier.needsLiveBinding,
						t,
						snippets
					)}${s}${n}}`;
					exportBlock +=
						cnst === 'var' && specifier.needsLiveBinding
							? `Object.keys(${name}).forEach(${getFunctionIntro(['k'], {
									isAsync: false,
									name: null
							  })}${copyPropertyIfNecessary});`
							: `for${_}(${cnst} k in ${name})${_}${copyPropertyIfNecessary}`;
				}
			}
		}
	}

	if (exportBlock) {
		return `${n}${n}${exportBlock}`;
	}

	return '';
}

function getSingleDefaultExport(
	exports: ChunkExports,
	dependencies: ChunkDependency[],
	interop: GetInterop,
	externalLiveBindings: boolean,
	getPropertyAccess: (name: string) => string
) {
	if (exports.length > 0) {
		return exports[0].local;
	} else {
		for (const {
			defaultVariableName,
			importPath,
			isChunk,
			name,
			namedExportsMode: depNamedExportsMode,
			namespaceVariableName,
			reexports
		} of dependencies) {
			if (reexports) {
				return getReexportedImportName(
					name,
					reexports[0].imported,
					depNamedExportsMode,
					isChunk,
					defaultVariableName!,
					namespaceVariableName!,
					interop,
					importPath,
					externalLiveBindings,
					getPropertyAccess
				);
			}
		}
	}
}

function getReexportedImportName(
	moduleVariableName: string,
	imported: string,
	depNamedExportsMode: boolean,
	isChunk: boolean,
	defaultVariableName: string,
	namespaceVariableName: string,
	interop: GetInterop,
	moduleId: string,
	externalLiveBindings: boolean,
	getPropertyAccess: (name: string) => string
) {
	if (imported === 'default') {
		if (!isChunk) {
			const moduleInterop = interop(moduleId);
			const variableName = defaultInteropHelpersByInteropType[moduleInterop]
				? defaultVariableName
				: moduleVariableName;
			return isDefaultAProperty(moduleInterop, externalLiveBindings)
				? `${variableName}${getPropertyAccess('default')}`
				: variableName;
		}
		return depNamedExportsMode
			? `${moduleVariableName}${getPropertyAccess('default')}`
			: moduleVariableName;
	}
	if (imported === '*') {
		return (
			isChunk ? !depNamedExportsMode : namespaceInteropHelpersByInteropType[interop(moduleId)]
		)
			? namespaceVariableName
			: moduleVariableName;
	}
	return `${moduleVariableName}${getPropertyAccess(imported)}`;
}

function getEsModuleValue(getObject: GenerateCodeSnippets['getObject']) {
	return getObject([['value', 'true']], {
		lineBreakIndent: null
	});
}

export function getNamespaceMarkers(
	hasNamedExports: boolean,
	addEsModule: boolean,
	addNamespaceToStringTag: boolean,
	{ _, getObject }: GenerateCodeSnippets
): string {
	if (hasNamedExports) {
		if (addEsModule) {
			if (addNamespaceToStringTag) {
				return `Object.defineProperties(exports,${_}${getObject(
					[
						['__esModule', getEsModuleValue(getObject)],
						[null, `[Symbol.toStringTag]:${_}${getToStringTagValue(getObject)}`]
					],
					{
						lineBreakIndent: null
					}
				)});`;
			}
			return `Object.defineProperty(exports,${_}'__esModule',${_}${getEsModuleValue(getObject)});`;
		}
		if (addNamespaceToStringTag) {
			return `Object.defineProperty(exports,${_}Symbol.toStringTag,${_}${getToStringTagValue(
				getObject
			)});`;
		}
	}
	return '';
}

const getDefineProperty = (
	name: string,
	needsLiveBinding: boolean,
	t: string,
	{ _, getDirectReturnFunction, n }: GenerateCodeSnippets
) => {
	if (needsLiveBinding) {
		const [left, right] = getDirectReturnFunction([], {
			functionReturn: true,
			lineBreakIndent: null,
			name: null
		});
		return (
			`Object.defineProperty(exports,${_}k,${_}{${n}` +
			`${t}${t}enumerable:${_}true,${n}` +
			`${t}${t}get:${_}${left}${name}[k]${right}${n}${t}})`
		);
	}
	return `exports[k]${_}=${_}${name}[k]`;
};
