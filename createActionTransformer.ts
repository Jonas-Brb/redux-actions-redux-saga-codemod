import * as ts from 'typescript'

import * as utils from './shared/utils'
import * as p from './shared/predicates'
import { global } from './shared/global'

function findCreateActionArgumentReplacement(context: ts.TransformationContext, node: ts.Identifier, program: ts.Program) {
  const symbol = utils.getAliasedSymbol(node, program)
  const createSelectorCallExpression = utils.findCreateActionCallExpression(symbol, context, program)
  const variableStatement = utils.findVariableStatement(createSelectorCallExpression)

  return variableStatement
}

function transformCreateActionCallExpression(node: ts.CallExpression, context: ts.TransformationContext, program: ts.Program): ts.Node {
  if (utils.isCallExpressionByText(node, 'createAction')) {
    const argument = node.arguments[0]

    if (p.isActionTypeArgumentIdentifier(argument)) {
      ++global.COUNTER_HANDLED
      if (global.DEBUG) {
        console.log(`FOUND createAction(SOME_CONSTANT, ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      const variableStatement = findCreateActionArgumentReplacement(context, argument, program)

      if (variableStatement) {
        global.importsToAddCache.addValue(node.getSourceFile().fileName, variableStatement)
        const identifier = context.factory.createIdentifier(variableStatement.declarationList.declarations[0].name.getText())

        return context.factory.updateCallExpression(node, node.expression, undefined, [identifier, ...node.arguments.slice(1)])
      }

      return node
    }

    if (p.isActionTypeArgumentPropertyAccessExpression(argument)) {
      ++global.COUNTER_SKIPPED
      if (global.DEBUG) {
        console.log(`SKIPPED createAction(someConstants.SOME_CONSTANT, ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      return node
    }
  }

  return node
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function appendImports(node: ts.Node, context: ts.TransformationContext, program: ts.Program) {
  if (ts.isSourceFile(node) && global.importsToAddCache.getValue(node.fileName)?.length) {
    let newSourceFile = node
    const variableStatements = global.importsToAddCache.getValue(node.fileName) // maybe replace node.filename with newSourceFile

    for (const variableStatement of variableStatements) {
      const importStatements = newSourceFile.statements.filter(ts.isImportDeclaration)
      const otherStatments = newSourceFile.statements.filter(statement => !ts.isImportDeclaration(statement))
      const identifier = context.factory.createIdentifier(variableStatement.declarationList.declarations[0].name.getText())

      const importPath = utils.getImportPath(node.fileName, variableStatement.getSourceFile().fileName) // maybe replace node.filename with newSourceFile

      newSourceFile = context.factory.updateSourceFile(newSourceFile, [
        ...importStatements,
        context.factory.createImportDeclaration(
          undefined,
          context.factory.createImportClause(
            false,
            undefined,
            context.factory.createNamedImports([context.factory.createImportSpecifier(false, undefined, identifier)])
          ),
          context.factory.createStringLiteral(importPath)
        ),
        ...otherStatments
      ])
    }

    return newSourceFile
  }

  return node
}

export const createActionTransformerFactory = (program: ts.Program): ts.TransformerFactory<ts.Node> => {
  return context => {
    const visitor: ts.Visitor = node => {
      if (ts.isCallExpression(node)) {
        return transformCreateActionCallExpression(node, context, program)
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return node => {
      const visitedNode = ts.visitNode(node, visitor)

      const newVisitedNode = appendImports(visitedNode, context, program)

      return newVisitedNode ?? visitedNode
    }
  }
}
