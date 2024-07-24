import * as ts from 'typescript'

import { global } from './shared/global'
import * as predicates from './shared/predicates'
import * as utils from './shared/utils'

function findTakeLatestArgumentReplacement(context: ts.TransformationContext, node: ts.Identifier, program: ts.Program) {
  const symbol = utils.getAliasedSymbol(node, program)
  const createSelectorCallExpression = utils.findCreateActionCallExpression(symbol, context, program)
  const variableStatement = utils.findVariableStatement(createSelectorCallExpression)
  const propertyAssignment = utils.findPropertyAssignment(createSelectorCallExpression)

  return { variableStatement, propertyAssignment }
}

function transformTakeLatestCallExpression(node: ts.CallExpression, context: ts.TransformationContext, program: ts.Program): ts.Node {
  if (utils.isCallExpressionByText(node, 'takeLatest')) {
    const argument = node.arguments[0]

    if (predicates.isPatternArgumentIdentifier(argument)) {
      ++global.COUNTER_HANDLED
      if (global.DEBUG) {
        console.log(`FOUND takeLatest(SOME_CONSTANT, ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      const { variableStatement, propertyAssignment } = findTakeLatestArgumentReplacement(context, argument, program)

      if (variableStatement) {
        global.importsToAddCache.addValue(node.getSourceFile().fileName, variableStatement)

        utils.storeImportToRemove(program, argument, node.getSourceFile())

        const importIdentifier = context.factory.createIdentifier(variableStatement.declarationList.declarations[0].name.getText())
        const identifier = propertyAssignment
          ? context.factory.createPropertyAccessExpression(
              importIdentifier,
              context.factory.createIdentifier(propertyAssignment.name.getText())
            )
          : importIdentifier

        return context.factory.updateCallExpression(node, node.expression, undefined, [identifier, ...node.arguments.slice(1)])
      }

      return node
    }
    if (predicates.isPatternArgumentPropertyAccessExpression(argument)) {
      ++global.COUNTER_SKIPPED
      if (global.DEBUG) {
        console.log(`SKIPPED takeLatest(someConstants.SOME_CONSTANT, ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      return node
    }

    if (ts.isArrayLiteralExpression(argument) && argument.elements.some(predicates.isPatternArgumentIdentifier)) {
      ++global.COUNTER_HANDLED
      if (global.DEBUG) {
        console.log(`FOUND takeLatest([SOME_CONSTANT], ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      return context.factory.updateCallExpression(node, node.expression, undefined, [
        context.factory.updateArrayLiteralExpression(
          argument,
          argument.elements.map(element => {
            if (predicates.isPatternArgumentIdentifier(element)) {
              const { variableStatement } = findTakeLatestArgumentReplacement(context, element, program)

              if (variableStatement) {
                global.importsToAddCache.addValue(node.getSourceFile().fileName, variableStatement)

                utils.storeImportToRemove(program, element, node.getSourceFile())

                const identifier = context.factory.createIdentifier(variableStatement.declarationList.declarations[0].name.getText())

                return identifier
              }
            }

            return element
          })
        ),
        ...node.arguments.slice(1)
      ])
    }

    if (ts.isArrayLiteralExpression(argument) && argument.elements.some(predicates.isPatternArgumentPropertyAccessExpression)) {
      ++global.COUNTER_SKIPPED
      if (global.DEBUG) {
        console.log(`SKIPPED takeLatest([someConstants.SOME_CONSTANT], ...) @ ${node.getSourceFile().fileName}`)
        console.log(node.getText())
        console.log('\n')
      }

      return node
    }
  }

  return node
}

export const createTakeLatestTransformerFactory = (program: ts.Program): ts.TransformerFactory<ts.Node> => {
  return context => {
    const visitor: ts.Visitor = node => {
      if (ts.isCallExpression(node)) {
        return transformTakeLatestCallExpression(node, context, program)
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return node => {
      const visitedNode = ts.visitNode(node, visitor)

      return visitedNode
    }
  }
}

// https://ts-ast-viewer.com/#code/JYWwDg9gTgLgBAEQKYDMCGBXANjAkuaGARjhSghDgHIokATDADwFo0BjGYCAOwGcqAUKEiw4AKjhpecAHJoQSXmHb18I+GQrVaDFu049+QgqIDeAuHACyABQD6AZQAqAQSe5nuAMIO7uGbhOdgBiAKJOXgASADQW1vbObh7uPnYASqEO4ZLSDhRIMAAWwNwA5qFYvEixAL6k5JRUAHQA9GyGMGjcMEbG6oiomDhqhABM0XCmdZqNre18nd1GwoST0w3Ucx1dPYIC+wLzvBBYSE1YEKUAFHGWyOjYeCYwsZaWcgpKKnQjsK9vtkcrncnlS-kCIXCUX+ljyCiKJXKlSQAgAlPsjvB9FxuGgAAxwAC8cDYtDQMCQLg4OKucIKxTKFSq6MxkmpPDQJGJpKQ5Mp7O4V0BiRBKV84KCYQikRZHTZBlxoyJJLJFKpCquACsObwmsLgclvOKApKoTLDnLsRyAMzKnl89U0gDa+qSoONEKlUQAurKFvKcWgACx21X8jVO7W43Wu0VGvwmyHS337JCMfqsq3cABGXJVvLVAqFCQN7oTnrN6LTGctAuzSu5YcdPC1Or1JbdYvLpulVfTq0zddtjYL4edscNYMTXsiKerA9rCuzIZHDqLkbbE7LEqTPr7Nf9Wez0mJ5jeAZ4RAAXPm1xqt12dzP0ees6Mb-bCxqo1J20DO-GT6VrcF7cNaH5NuuD6AdOZopq+ApBhBo7NoKG7Rn+IqTh6PZ7gINQCFmupZkQhECpyVzogI86iKyFylCUwTQCAqEnpMcT0YxzE2BAvAwAg5JoMhd40tBU4Vr2tQHJ0ADWSAADJ8nxxb-nG4m4TE1A-vw6KyQpSkwFcVBiThu6RFQEwAO7QHJUCokAA
