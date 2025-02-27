import type { AstContext } from '../../Module';
import type ClassNode from '../nodes/shared/ClassNode';
import LocalVariable from '../variables/LocalVariable';
import ThisVariable from '../variables/ThisVariable';
import ChildScope from './ChildScope';
import type Scope from './Scope';

export default class ClassBodyScope extends ChildScope {
	instanceScope: ChildScope;
	thisVariable: LocalVariable;

	constructor(parent: Scope, classNode: ClassNode, context: AstContext) {
		super(parent);
		this.variables.set(
			'this',
			(this.thisVariable = new LocalVariable('this', null, classNode, context))
		);
		this.instanceScope = new ChildScope(this);
		this.instanceScope.variables.set('this', new ThisVariable(context));
	}

	findLexicalBoundary(): ChildScope {
		return this;
	}
}
