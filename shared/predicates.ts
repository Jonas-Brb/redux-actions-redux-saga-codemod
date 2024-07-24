import * as ts from 'typescript'

// #region takeLatest(...,) matcher variations

export function isPatternArgumentIdentifier(node: ts.Node): node is ts.Identifier {
  return !!(ts.isIdentifier(node) && node.text.match(/^[A-Z_]+$/))
}

export function isPatternArgumentPropertyAccessExpression(node: ts.Node): node is ts.Identifier {
  return !!(ts.isPropertyAccessExpression(node) && isPatternArgumentIdentifier(node.name))
}

// #endregion

// #region createAction(...,) matcher variations

export function isActionTypeArgumentIdentifier(node: ts.Node): node is ts.Identifier {
  return isPatternArgumentIdentifier(node)
}

export function isActionTypeArgumentPropertyAccessExpression(node: ts.Node): node is ts.Identifier {
  return isPatternArgumentPropertyAccessExpression(node)
}

// #endregion
