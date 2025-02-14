import * as THREE from 'three'

export class FilterService {
  // 이동평균 필터
  static movingAverageFilter(points: THREE.Vector3[], windowSize: number): THREE.Vector3[] {
    const smoothedPoints: THREE.Vector3[] = []
    for (let i = 0; i < points.length; i++) {
      let sumX = 0,
        sumY = 0,
        sumZ = 0
      let count = 0

      for (
        let j = Math.max(0, i - Math.floor(windowSize / 2));
        j < Math.min(points.length, i + Math.floor(windowSize / 2));
        j++
      ) {
        sumX += points[j].x
        sumY += points[j].y
        sumZ += points[j].z
        count++
      }

      smoothedPoints.push(new THREE.Vector3(sumX / count, sumY / count, sumZ / count))
    }
    return smoothedPoints
  }

  // Savitzky-Golay 필터
  static savitzkyGolayFilter(
    points: THREE.Vector3[],
    windowSize: number,
    degree: number
  ): THREE.Vector3[] {
    if (windowSize % 2 === 0) windowSize += 1
    if (windowSize < degree + 1) windowSize = degree + 1

    const halfWindow = Math.floor(windowSize / 2)
    const smoothedPoints: THREE.Vector3[] = []

    for (let i = 0; i < points.length; i++) {
      const windowPoints: THREE.Vector3[] = []
      const weights: number[] = []

      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j
        if (idx >= 0 && idx < points.length) {
          windowPoints.push(points[idx])
          weights.push(1)
        }
      }

      if (windowPoints.length < degree + 1) {
        smoothedPoints.push(points[i].clone())
        continue
      }

      const smoothedPoint = new THREE.Vector3()
      ;['x', 'y', 'z'].forEach((coord) => {
        const values = windowPoints.map((p) => p[coord as keyof THREE.Vector3] as number)
        const t = Array.from(
          { length: windowPoints.length },
          (_, i) => i - Math.floor(windowPoints.length / 2)
        )
        const coeffs = this.polynomialFit(t, values, degree, weights)
        const value = this.evaluatePolynomial(coeffs, 0)

        if (coord === 'x') smoothedPoint.x = value
        else if (coord === 'y') smoothedPoint.y = value
        else if (coord === 'z') smoothedPoint.z = value
      })

      smoothedPoints.push(smoothedPoint)
    }

    return smoothedPoints
  }

  // 가우시안 필터
  static gaussianFilter(
    points: THREE.Vector3[],
    sigma: number,
    windowSize: number
  ): THREE.Vector3[] {
    if (windowSize % 2 === 0) windowSize += 1
    const halfWindow = Math.floor(windowSize / 2)

    const kernel = Array.from({ length: windowSize }, (_, i) => {
      const x = i - halfWindow
      return Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI))
    })

    const kernelSum = kernel.reduce((a, b) => a + b, 0)
    const normalizedKernel = kernel.map((k) => k / kernelSum)

    const smoothedPoints: THREE.Vector3[] = []

    for (let i = 0; i < points.length; i++) {
      const smoothedPoint = new THREE.Vector3()
      let weightSum = 0

      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j
        if (idx >= 0 && idx < points.length) {
          const weight = normalizedKernel[j + halfWindow]
          smoothedPoint.add(points[idx].clone().multiplyScalar(weight))
          weightSum += weight
        }
      }

      if (weightSum > 0) {
        smoothedPoint.divideScalar(weightSum)
      }

      smoothedPoints.push(smoothedPoint)
    }

    return smoothedPoints
  }

  // 헬퍼 함수들
  private static polynomialFit(
    x: number[],
    y: number[],
    degree: number,
    weights: number[]
  ): number[] {
    const n = x.length
    const m = degree + 1

    const A = Array(m)
      .fill(0)
      .map(() => Array(m).fill(0))
    const b = Array(m).fill(0)

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        for (let k = 0; k < n; k++) {
          A[i][j] += weights[k] * Math.pow(x[k], i + j)
        }
      }
      for (let k = 0; k < n; k++) {
        b[i] += weights[k] * y[k] * Math.pow(x[k], i)
      }
    }

    return this.gaussianElimination(A, b)
  }

  private static evaluatePolynomial(coeffs: number[], x: number): number {
    return coeffs.reduce((sum, coeff, i) => sum + coeff * Math.pow(x, i), 0)
  }

  private static gaussianElimination(A: number[][], b: number[]): number[] {
    const n = A.length
    const augmented = A.map((row, i) => [...row, b[i]])

    for (let i = 0; i < n; i++) {
      let maxRow = i
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = j
        }
      }
      ;[augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]]

      for (let j = i + 1; j < n; j++) {
        const factor = augmented[j][i] / augmented[i][i]
        for (let k = i; k <= n; k++) {
          augmented[j][k] -= factor * augmented[i][k]
        }
      }
    }

    const x = new Array(n).fill(0)
    for (let i = n - 1; i >= 0; i--) {
      let sum = augmented[i][n]
      for (let j = i + 1; j < n; j++) {
        sum -= augmented[i][j] * x[j]
      }
      x[i] = sum / augmented[i][i]
    }

    return x
  }
}
