import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

export class OBJReader {
  async openFileDialog(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.obj'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0] || null
        resolve(file)
      }
      input.click()
    })
  }

  async readOBJFile(file: File): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const loader = new OBJLoader()
          const objContent = event.target?.result as string
          const object = loader.parse(objContent)
          resolve(object)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }
}
