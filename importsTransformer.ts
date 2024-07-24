import * as ts from 'typescript'

import { global } from './shared/global'
import * as utils from './shared/utils'

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

function removeNamedImports(node: ts.Node, context: ts.TransformationContext, program: ts.Program) {
  if (ts.isSourceFile(node) && global.importsToRemoveCache.getValue(node.fileName)?.length) {
    const importsToRemove = global.importsToRemoveCache.getValue(node.fileName)
    const typeChecker = program.getTypeChecker()

    const visitNamedImportElement = (node: ts.ImportSpecifier): ts.ImportSpecifier | undefined => {
      const candidateForRemoval = typeChecker.getSymbolAtLocation(node.propertyName ?? node.name)
      if (importsToRemove.some(importToRemove => typeChecker.getSymbolAtLocation(importToRemove) === candidateForRemoval)) {
        return undefined
      }

      return node
    }

    const visitor: ts.Visitor = node => {
      if (ts.isNamedImports(node)) {
        const updatedElements = node.elements.map(element => visitNamedImportElement(element)!).filter(Boolean)

        if (updatedElements.length > 0) {
          return context.factory.updateNamedImports(node, updatedElements)
        }

        return context.factory.createNamedImports([])
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return ts.visitNode(node, visitor)
  }

  return node
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function removeEmptyImports(node: ts.Node, context: ts.TransformationContext, program: ts.Program) {
  if (ts.isSourceFile(node) && global.importsToRemoveCache.getValue(node.fileName)?.length) {
    const visitor: ts.Visitor = node => {
      if (ts.isImportDeclaration(node)) {
        const importClause = node.importClause
        if (importClause) {
          const namedBindings = importClause.namedBindings
          if (namedBindings && ts.isNamedImports(namedBindings)) {
            if (namedBindings.elements.length === 0) {
              return importClause.name
                ? context.factory.updateImportDeclaration(
                    node,
                    node.modifiers,
                    context.factory.updateImportClause(importClause, importClause.isTypeOnly, importClause.name, undefined),
                    node.moduleSpecifier,
                    undefined
                  )
                : undefined
            }
          }
        }

        return node
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return ts.visitNode(node, visitor)
  }

  return node
}

export const createImportsTransformerFactory = (program: ts.Program): ts.TransformerFactory<ts.Node> => {
  return context => {
    return node => {
      let visitedNode = node

      visitedNode = appendImports(visitedNode, context, program)!
      visitedNode = removeNamedImports(visitedNode, context, program)!
      visitedNode = removeEmptyImports(visitedNode, context, program)!

      return visitedNode
    }
  }
}
