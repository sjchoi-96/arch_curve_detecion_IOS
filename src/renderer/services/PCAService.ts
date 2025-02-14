import * as THREE from 'three'

export class PCAService {
  // 3차 방정식 해법
  private static solveCubic(p: number, q: number): number[] {
    const D = (q * q) / 4 + (p * p * p) / 27

    if (D > 0) {
      const u = Math.cbrt(-q / 2 + Math.sqrt(D))
      const v = Math.cbrt(-q / 2 - Math.sqrt(D))
      return [u + v]
    } else if (D === 0) {
      const u = Math.cbrt(-q / 2)
      return [2 * u, -u]
    } else {
      const phi = Math.acos(-q / (2 * Math.sqrt(-Math.pow(p / 3, 3))))
      const r = 2 * Math.sqrt(-p / 3)
      return [
        r * Math.cos(phi / 3),
        r * Math.cos((phi + 2 * Math.PI) / 3),
        r * Math.cos((phi + 4 * Math.PI) / 3)
      ]
    }
  }

  private static solveLinearSystem(matrix: THREE.Matrix3): number[] {
    const m = matrix.elements
    const absValues = [
      Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]),
      Math.abs(m[3]) + Math.abs(m[4]) + Math.abs(m[5]),
      Math.abs(m[6]) + Math.abs(m[7]) + Math.abs(m[8])
    ]

    const minIndex = absValues.indexOf(Math.min(...absValues))
    let x, y, z

    switch (minIndex) {
      case 0:
        y = Math.random() * 2 - 1
        z = Math.random() * 2 - 1
        x = -(m[1] * y + m[2] * z) / (m[0] || 1e-10)
        break
      case 1:
        x = Math.random() * 2 - 1
        z = Math.random() * 2 - 1
        y = -(m[3] * x + m[5] * z) / (m[4] || 1e-10)
        break
      default:
        x = Math.random() * 2 - 1
        y = Math.random() * 2 - 1
        z = -(m[6] * x + m[7] * y) / (m[8] || 1e-10)
    }

    const length = Math.sqrt(x * x + y * y + z * z)
    return [x / length, y / length, z / length]
  }

  private static computeEigenvalues(matrix: THREE.Matrix3): number[] {
    const a = -1
    const b = matrix.elements[0] + matrix.elements[4] + matrix.elements[8]
    const c =
      -(
        matrix.elements[0] * matrix.elements[4] +
        matrix.elements[4] * matrix.elements[8] +
        matrix.elements[8] * matrix.elements[0]
      ) +
      matrix.elements[1] * matrix.elements[1] +
      matrix.elements[2] * matrix.elements[2] +
      matrix.elements[5] * matrix.elements[5]
    const d =
      matrix.elements[0] * matrix.elements[4] * matrix.elements[8] +
      2 * matrix.elements[1] * matrix.elements[5] * matrix.elements[2] -
      matrix.elements[0] * matrix.elements[5] * matrix.elements[5] -
      matrix.elements[4] * matrix.elements[2] * matrix.elements[2] -
      matrix.elements[8] * matrix.elements[1] * matrix.elements[1]

    const p = (3 * a * c - b * b) / (3 * a * a)
    const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a)
    const roots = this.solveCubic(p, q)

    return roots.sort((a, b) => b - a)
  }

  private static computeEigenvectors(matrix: THREE.Matrix3, eigenvalues: number[]): number[][] {
    const eigenvectors: number[][] = []

    eigenvalues.forEach((lambda) => {
      const tempMatrix = matrix.clone()
      tempMatrix.elements[0] -= lambda
      tempMatrix.elements[4] -= lambda
      tempMatrix.elements[8] -= lambda

      const v = this.solveLinearSystem(tempMatrix)
      eigenvectors.push(v)
    })

    return eigenvectors
  }

  public static computePCA(vertices: Float32Array): {
    eigenvalues: number[]
    eigenvectors: number[][]
    center: THREE.Vector3
  } {
    const center = new THREE.Vector3()
    const vertexCount = vertices.length / 3
    for (let i = 0; i < vertices.length; i += 3) {
      center.x += vertices[i]
      center.y += vertices[i + 1]
      center.z += vertices[i + 2]
    }
    center.divideScalar(vertexCount)

    const covariance = new Array(9).fill(0)
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] - center.x
      const y = vertices[i + 1] - center.y
      const z = vertices[i + 2] - center.z

      covariance[0] += x * x
      covariance[1] += x * y
      covariance[2] += x * z
      covariance[4] += y * y
      covariance[5] += y * z
      covariance[8] += z * z
    }
    covariance[3] = covariance[1]
    covariance[6] = covariance[2]
    covariance[7] = covariance[5]

    for (let i = 0; i < 9; i++) {
      covariance[i] /= vertexCount
    }

    const matrix = new THREE.Matrix3().fromArray(covariance)
    const eigenvalues = this.computeEigenvalues(matrix)
    const eigenvectors = this.computeEigenvectors(matrix, eigenvalues)

    return {
      eigenvalues,
      eigenvectors,
      center
    }
  }
}
