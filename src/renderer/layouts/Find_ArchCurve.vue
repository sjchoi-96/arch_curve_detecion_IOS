<script setup lang="ts">
  // Three.js 임포트 추가
  import * as THREE from 'three'
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
  import { STLReader } from '../services/STLReader'
  import { OBJReader } from '../services/OBJReader'
  import { FilterService } from '../services/FilterService'

  // 상수 정의
  const CONSTANTS = {
    SAMPLING: {
      SPHERE_SIZE: 0.2,
      THETA_STEP: (Math.PI / 180) * 0.5, // 각도 간격
      THETA_TOLERANCE: (Math.PI / 180) * 0.5, // 허용 오차
      MAX_POINTS: 20
    },
    COLORS: {
      MESH: 0x808080,
      SAMPLING_POINT: 0x0000ff,
      EXTREME_POINT: 0xffff00,
      INTERSECTION_POINT: 0xffa500,
      AXES: [0xff0000, 0x00ff00, 0x0000ff]
    },
    CAMERA: {
      FOV: 75,
      POSITION: { x: 10, y: 10, z: 10 }
    },
    ARROW: {
      LENGTH: 2,
      HEAD_LENGTH: 0.2,
      HEAD_WIDTH: 0.1
    }
  }

  // 타입 정의
  interface SamplingPoint {
    theta: number
    points: THREE.Vector3[]
  }

  // STL 또는 OBJ 파일을 로드하고 3D 시각화하는 메인 함수
  async function loadAndProcessFile(containerId: string, fileType: 'stl' | 'obj') {
    try {
      // 파일에서 추출할 지오메트리를 저장할 변수
      let geometry: THREE.BufferGeometry

      // 파일 형식에 따라 적절한 리더 사용
      if (fileType === 'stl') {
        // STL 파일 처리
        const stlReader = new STLReader()
        const file = await stlReader.openFileDialog()
        if (!file) return
        const result = await stlReader.readSTLFile(file)
        geometry = result.geometry
      } else {
        // OBJ 파일 처리
        const objReader = new OBJReader()
        const file = await objReader.openFileDialog()
        if (!file) return
        const object = await objReader.readOBJFile(file)
        // OBJ 파일에서 첫 번째 메쉬 추출
        const firstMesh = object.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh
        if (!firstMesh) {
          throw new Error('No mesh found in OBJ file')
        }
        geometry = firstMesh.geometry
      }

      // 메쉬 재질 설정 - 회색 PhongMaterial 사용
      const material = new THREE.MeshPhongMaterial({
        color: 0x808080, // 기본 색상
        specular: 0x111111, // 반사광 색상
        shininess: 200 // 광택도
      })
      const mesh = new THREE.Mesh(geometry, material)

      // 메쉬를 장면의 중앙에 위치시키기
      const box = new THREE.Box3().setFromObject(mesh)
      const center = box.getCenter(new THREE.Vector3())
      mesh.position.x = -center.x
      mesh.position.y = -center.y
      mesh.position.z = -center.z

      // 3D 뷰어를 표시할 컨테이너 요소 가져오기
      const container = document.getElementById(containerId)
      if (!container) return console.error('Container not found')

      // Three.js 씬, 카메라, 렌더러 초기화
      const { scene, camera, renderer } = setupScene(container)

      // 조명 설정
      // 주변광(AmbientLight)으로 전체적인 밝기 조절
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
      // 방향성 조명(DirectionalLight)으로 그림자와 입체감 표현
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight.position.set(1, 1, 1)
      scene.add(ambientLight)
      scene.add(directionalLight)

      // 좌표계 시각화
      setupCoordinateSystem(scene)

      // 메쉬를 씬에 추가
      scene.add(mesh)

      // 카메라 초기 위치 및 방향 설정
      camera.position.set(
        CONSTANTS.CAMERA.POSITION.x,
        CONSTANTS.CAMERA.POSITION.y,
        CONSTANTS.CAMERA.POSITION.z
      )
      camera.lookAt(0, 0, 0)

      // 마우스로 카메라 제어를 위한 OrbitControls 설정
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true // 부드러운 카메라 움직임

      const samplingPoints = sphericalSampling(mesh, scene)
      const { extremePoints, intersectionPoints } = processExtremeAndIntersectionPoints(
        samplingPoints,
        scene
      )

      const DE_Distance = extremePoints[1]?.distanceTo(extremePoints[2]) ?? 0
      const BC_Distance = intersectionPoints[0]?.distanceTo(intersectionPoints[1]) ?? 0
      const pointF = extremePoints[1].clone().add(extremePoints[2].clone()).divideScalar(2)
      const pointA = extremePoints[0].clone()
      const AF_Distance = pointA.distanceTo(pointF)
      const AF_DE_Ratio = AF_Distance / DE_Distance
      const BC_DE_Ratio = BC_Distance / DE_Distance

      console.log('DE_Distance', DE_Distance.toFixed(2))
      console.log('BC_Distance', BC_Distance.toFixed(2))
      console.log('AF_Distance', AF_Distance.toFixed(2))
      console.log('AF_DE_Ratio', AF_DE_Ratio.toFixed(2))
      console.log('BC_DE_Ratio', BC_DE_Ratio.toFixed(2))

      // 렌더링 루프 설정
      function animate() {
        requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()
    } catch (error) {
      console.error(`${fileType.toUpperCase()} 파일 로드 중 오류 발생:`, error)
    }
  }

  // 극좌표계 변환 및 포인트 수집 함수
  function collectPointsFromHeight(
    vertices: THREE.BufferAttribute,
    vertexCount: number,
    mesh: THREE.Mesh,
    center: THREE.Vector3,
    currentTheta: number
  ): { point: THREE.Vector3; z: number }[] {
    const currentPoints: { point: THREE.Vector3; z: number }[] = []

    for (let i = 0; i < vertexCount; i++) {
      const vertex = new THREE.Vector3(
        vertices.getX(i),
        vertices.getY(i),
        vertices.getZ(i)
      ).applyMatrix4(mesh.matrixWorld)

      const relativeX = vertex.x - center.x
      const relativeZ = vertex.z - center.z

      const theta = Math.atan2(relativeZ, relativeX)
      const normalizedTheta = theta < 0 ? theta + 2 * Math.PI : theta

      if (Math.abs(normalizedTheta - currentTheta) <= CONSTANTS.SAMPLING.THETA_TOLERANCE) {
        currentPoints.push({
          point: vertex.clone(),
          z: vertex.z - center.z
        })
      }
    }

    return currentPoints
  }

  // y좌표 조정 함수
  function adjustPointsHeight(points: THREE.Vector3[], targetY: number): THREE.Vector3[] {
    return points.map((point) => {
      const adjustedPoint = point.clone()
      adjustedPoint.y = targetY
      return adjustedPoint
    })
  }

  // 구체 메쉬 생성을 위한 유틸리티 함수
  function createSphereMesh(
    color: number,
    size: number = CONSTANTS.SAMPLING.SPHERE_SIZE,
    opacity: number = 0.8
  ): THREE.Mesh {
    const sphereGeometry = new THREE.SphereGeometry(size)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true
    })
    return new THREE.Mesh(sphereGeometry, sphereMaterial)
  }

  // 극좌표계 샘플링 함수 추가
  function sphericalSampling(mesh: THREE.Mesh, scene: THREE.Scene) {
    const samplingPoints: { theta: number; points: THREE.Vector3[] }[] = []
    const sphereGeometry = new THREE.SphereGeometry(CONSTANTS.SAMPLING.SPHERE_SIZE)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: CONSTANTS.COLORS.SAMPLING_POINT,
      transparent: true,
      opacity: 0.8,
      depthTest: true
    })

    // Three.js 메쉬에서 정점(vertices) x, y, z 좌표값 위치 데이터 가져오기
    const vertices = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    // 메쉬에 있는 전체 정점의 개수 계산, 정점 순회 처리에 사용됨
    const vertexCount = vertices.count
    // 극좌표계 중심점 계산
    const center = getPolarCenter(mesh)

    // 메인 샘플링 루프
    for (
      let currentTheta = 0;
      currentTheta < 2 * Math.PI;
      currentTheta += CONSTANTS.SAMPLING.THETA_STEP
    ) {
      let currentPoints = collectPointsFromHeight(vertices, vertexCount, mesh, center, currentTheta)

      // y값을 기준으로 정렬하고 threshold 적용
      currentPoints.sort((a, b) => b.z - a.z)
      currentPoints = currentPoints.slice(0, 100)

      // 입력 데이터의 y좌표 고정된 값으로 조정
      const adjustedPoints = adjustPointsHeight(
        currentPoints.map((cp) => cp.point),
        0
      )

      if (adjustedPoints.length > 0) {
        // 이동평균 필터 적용
        const smoothedPoints = FilterService.movingAverageFilter(
          adjustedPoints,
          100 // 윈도우 크기
        )

        // visualizePoints(smoothedPoints, scene, CONSTANTS.COLORS.SAMPLING_POINT)

        samplingPoints.push({
          theta: (currentTheta * 180) / Math.PI,
          points: smoothedPoints
        })
      }
    }

    return samplingPoints
  }

  // 극값 포인트와 교차점을 처리하는 함수
  function processExtremeAndIntersectionPoints(
    samplingPoints: SamplingPoint[],
    scene: THREE.Scene
  ): { extremePoints: THREE.Vector3[]; intersectionPoints: THREE.Vector3[] } {
    // 극값 포인트 찾기 및 시각화
    const extremePointsObj = findExtremePoints(samplingPoints)
    const extremePoints = [
      extremePointsObj.pointA,
      extremePointsObj.pointD,
      extremePointsObj.pointE
    ].filter((p): p is THREE.Vector3 => p !== null)
    visualizeExtremePoints(scene, extremePoints)

    // 교차점 찾기 및 스플라인과 함께 시각화
    const intersectionPoints = calculateIntersectionPoints(extremePointsObj, samplingPoints)
    visualizeIntersectionPointsAndSpline(scene, intersectionPoints, extremePointsObj)

    return { extremePoints, intersectionPoints }
  }

  // 유틸리티 함수들
  const createLabel = (text: string): THREE.Sprite => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 128 // 캔버스 크기 증가
    canvas.height = 128

    if (context) {
      context.fillStyle = '#ffffff'
      context.font = 'bold 64px Arial' // 폰트 크기 증가
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, 64, 64) // 중앙 위치 조정
    }

    const texture = new THREE.CanvasTexture(canvas)
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.scale.set(1, 1, 1) // 스프라이트 크기 증가
    return sprite
  }

  // 씬 설정 함수
  const setupScene = (
    container: HTMLElement
  ): {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
  } => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      CONSTANTS.CAMERA.FOV,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)

    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    return { scene, camera, renderer }
  }

  // 좌표계 설정 함수
  const setupCoordinateSystem = (scene: THREE.Scene): void => {
    const axesHelper = new THREE.AxesHelper(3)
    scene.add(axesHelper)

    const axesLabels = ['X', 'Y', 'Z']
    const labelPositions = [
      new THREE.Vector3(3.2, 0, 0),
      new THREE.Vector3(0, 3.2, 0),
      new THREE.Vector3(0, 0, 3.2)
    ]

    axesLabels.forEach((text, index) => {
      const sprite = createLabel(text)
      sprite.position.copy(labelPositions[index])
      scene.add(sprite)
    })
  }

  // 극좌표계 원점 계산
  function getPolarCenter(mesh: THREE.Mesh): THREE.Vector3 {
    const box = new THREE.Box3().setFromObject(mesh)
    const centerX = (box.max.x + box.min.x) / 2
    const centerZ = box.min.z
    const centerY = 0

    return new THREE.Vector3(centerX, centerY, centerZ)
  }

  // 극값 포인트를 찾는 함수
  function findExtremePoints(samplingPoints: SamplingPoint[]): {
    pointA: THREE.Vector3 | null // maxZPoint -> pointA
    pointD: THREE.Vector3 | null // minXPoint -> pointD
    pointE: THREE.Vector3 | null // maxXPoint -> pointE
  } {
    let pointA: THREE.Vector3 | null = null
    let pointD: THREE.Vector3 | null = null
    let pointE: THREE.Vector3 | null = null
    let maxZ = -Infinity
    let minX = Infinity
    let maxX = -Infinity

    // 모든 포인트를 하나의 배열로 변환
    const allPoints: THREE.Vector3[] = samplingPoints.flatMap((sp) => sp.points)

    // 극값 포인트 찾기
    samplingPoints.forEach(({ points }) => {
      points.forEach((point) => {
        if (point.z > maxZ) {
          maxZ = point.z
          pointA = point.clone()
        }
        if (point.x < minX) {
          minX = point.x
          pointD = point.clone()
        }
        if (point.x > maxX) {
          maxX = point.x
          pointE = point.clone()
        }
      })
    })

    // 극값 포인트들을 주변 점들의 평균 위치로 보정
    const radius = 5 // 반경 설정 (필요에 따라 조정)

    if (pointA) {
      pointA = calculateAveragePosition(pointA, radius, allPoints)
    }
    if (pointD) {
      pointD = calculateAveragePosition(pointD, radius, allPoints)
    }
    if (pointE) {
      pointE = calculateAveragePosition(pointE, radius, allPoints)
    }

    return { pointA, pointD, pointE }
  }

  // 극값 포인트를 시각화하는 함수
  function visualizeExtremePoints(scene: THREE.Scene, extremePoints: THREE.Vector3[]): void {
    extremePoints.forEach((point) => {
      if (point) {
        const extremeSphere = createSphereMesh(CONSTANTS.COLORS.EXTREME_POINT, 0.4)
        extremeSphere.position.copy(point)
        scene.add(extremeSphere)
      }
    })
  }

  // 스플라인 곡선 생성 함수
  function createSplineCurve(points: THREE.Vector3[], pointCount: number): THREE.Line {
    const color = 0xff0000
    const linewidth = 2
    // 점들을 부드럽게 연결하는 곡선 생성
    const curve = new THREE.CatmullRomCurve3(points)
    // 곡선을 따라 지정된 수의 점을 생성
    const curvePoints = curve.getPoints(pointCount)

    // 곡선 geometry 생성
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints)

    // 곡선 material 생성
    const curveMaterial = new THREE.LineBasicMaterial({
      color,
      linewidth
    })

    // 곡선 생성 및 반환
    return new THREE.Line(curveGeometry, curveMaterial)
  }

  // 교차점을 계산하는 함수
  function calculateIntersectionPoints(
    extremePoints: {
      pointD: THREE.Vector3 | null
      pointE: THREE.Vector3 | null
      pointA: THREE.Vector3 | null
    },
    samplingPoints: SamplingPoint[]
  ): THREE.Vector3[] {
    const { pointD, pointE, pointA } = extremePoints
    if (!pointD || !pointE || !pointA) return []

    // 선분의 방향 벡터 계산
    const lineVector = pointE.clone().sub(pointD)

    // pointA에서 선분까지의 수직 거리 계산
    const lineDirection = lineVector.clone().normalize()
    const pointToLine = pointA.clone().sub(pointD)
    const projection = lineDirection.multiplyScalar(pointToLine.dot(lineDirection))
    const perpendicular = pointToLine.sub(projection)
    const distance = perpendicular.length()

    // 1/3 지점 계산
    const targetDistance = (distance / 3) * 2
    const targetPoint = pointA
      .clone()
      .sub(perpendicular.normalize().multiplyScalar(distance - targetDistance))

    // 평행선의 방향 벡터
    const parallelDirection = lineVector.normalize()

    // 평행선 위의 점들 찾기
    const foundPoints: THREE.Vector3[] = []
    samplingPoints.forEach(({ points }) => {
      points.forEach((point) => {
        const pointToTarget = point.clone().sub(targetPoint)
        const projectionLength = pointToTarget.dot(parallelDirection)
        const projectionPoint = targetPoint
          .clone()
          .add(parallelDirection.clone().multiplyScalar(projectionLength))
        const distanceToLine = point.distanceTo(projectionPoint)

        if (distanceToLine < 0.5) {
          foundPoints.push(point.clone())
        }
      })
    })

    // 가장 가까운 두 점 선택 및 위치 보정
    foundPoints.sort((a, b) => a.x - b.x)
    const allPoints = samplingPoints.flatMap((sp) => sp.points)
    const radius = 5

    // pointB와 pointC 반환 (x 좌표 기준으로 정렬됨)
    return [
      calculateAveragePosition(foundPoints[0], radius, allPoints), // pointB
      calculateAveragePosition(foundPoints[foundPoints.length - 1], radius, allPoints) // pointC
    ]
  }

  // 교차점과 스플라인을 시각화하는 함수
  function visualizeIntersectionPointsAndSpline(
    scene: THREE.Scene,
    intersectionPoints: THREE.Vector3[],
    extremePoints: {
      pointD: THREE.Vector3 | null
      pointE: THREE.Vector3 | null
      pointA: THREE.Vector3 | null
    }
  ): void {
    const { pointD, pointE, pointA } = extremePoints
    if (!pointD || !pointE || !pointA || intersectionPoints.length !== 2) return

    // 스플라인 곡선을 위한 점들 순서 정렬
    const curvePoints = [
      pointD.clone(),
      intersectionPoints[0].clone(),
      pointA.clone(),
      intersectionPoints[1].clone(),
      pointE.clone()
    ]

    // 스플라인 곡선 생성 및 추가
    const splineCurve = createSplineCurve(curvePoints, 50)
    scene.add(splineCurve)

    // 교차점 시각화
    const sphereGeometry = new THREE.SphereGeometry(0.4)
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: CONSTANTS.COLORS.INTERSECTION_POINT,
      transparent: true,
      opacity: 0.8
    })

    intersectionPoints.forEach((point) => {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.copy(point)
      scene.add(sphere)
    })
  }

  // 반경 내 포인트들의 평균 위치를 계산하는 함수
  function calculateAveragePosition(
    targetPoint: THREE.Vector3,
    radius: number,
    allPoints: THREE.Vector3[]
  ): THREE.Vector3 {
    // 반경 내에 있는 점들을 필터링
    const pointsInRadius = allPoints.filter((point) => point.distanceTo(targetPoint) <= radius)

    // 반경 내 점이 없으면 원래 점을 반환
    if (pointsInRadius.length === 0) {
      return targetPoint.clone()
    }

    // 모든 좌표의 합을 계산
    const sum = pointsInRadius.reduce(
      (acc, point) => {
        acc.x += point.x
        acc.y += point.y
        acc.z += point.z
        return acc
      },
      new THREE.Vector3(0, 0, 0)
    )

    // 평균 계산
    sum.divideScalar(pointsInRadius.length)

    return sum
  }
</script>

<template>
  <div class="visualization-container">
    <div class="viz-wrapper">
      <div id="stl-viewer" class="visualization"></div>
      <div class="file-buttons">
        <button class="load-file-btn" @click="loadAndProcessFile('stl-viewer', 'stl')">
          STL 파일 불러오기
        </button>
        <button class="load-file-btn" @click="loadAndProcessFile('stl-viewer', 'obj')">
          OBJ 파일 불러오기
        </button>
      </div>

      <div class="legend">
        <div class="legend-item">
          <span class="color-box blue"></span>
          <span>샘플링 포인트</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .visualization-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
    margin: 20px;
    width: 100%;
    height: 600px;
  }

  .viz-wrapper {
    display: flex;
    flex-direction: column;
    width: 45%;
    min-width: 400px;
  }

  .visualization {
    height: 550px;
    border: 1px solid #000000;
    border-radius: 4px;
    overflow: hidden;
  }

  .legend {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 10px;
    padding: 5px;
    background-color: rgba(117, 115, 115, 0.9);
    border-radius: 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .color-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .blue {
    background-color: #0000ff;
  }
  .green {
    background-color: #00ff00;
  }
  .yellow {
    background-color: #ffff00;
  }

  .file-buttons {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .load-file-btn {
    flex: 1;
    padding: 8px 16px;
    background-color: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
  }

  .load-file-btn:hover {
    background-color: #45a049;
  }

  .load-file-btn:active {
    background-color: #3d8b40;
  }
</style>

