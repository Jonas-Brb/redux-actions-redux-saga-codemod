//@ts-ignore
import * as ts from 'typescript'

const program: ts.Program = ts.createProgram(rootNames, compilerOptions)

const transformerFactory: ts.TransformerFactory<ts.Node> = (context: ts.TransformationContext) => {
  const visitor: ts.Visitor = node => {
    if (ts.isCallExpression(node)) {
      //return transformTakeLatestCallExpression(node, context, program)
    }

    return ts.visitEachChild(node, visitor, context)
  }

  const transformer: ts.Transformer<ts.Node> = (node: ts.Node): ts.Node => {
    const visitedNode = ts.visitNode(node, visitor)

    return visitedNode
  }

  return transformer
}

const transformationResult = ts.transform(sourceFile, [transformerFactory])
const transformedSourceFile = transformationResult.transformed[0]

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: false, removeComments: false })
const transformedCode = printer.printNode(ts.EmitHint.Unspecified, transformedSourceFile, undefined)

// write transformedCode to file
