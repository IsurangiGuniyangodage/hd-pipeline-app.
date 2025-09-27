pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'

    // ---- SonarQube (Code Quality) ----
    SONAR_SERVER = "sonarqube"                 // Manage Jenkins -> System -> SonarQube servers (name)
    SONAR_TOKEN  = credentials('sonar-token')  // (kept globally for convenience; we’ll still rebind in the stage)

    // ---- App URLs (compose maps 9090:3000) ----
    APP_HEALTH_URL_STAGING = "http://localhost:9090/health"
    APP_HEALTH_URL_PROD    = "http://localhost:9090/health"
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    // 1) Checkout & Build (artefact built later as Docker image)
    stage('Checkout & Build') {
      steps {
        checkout scm
        script {
          bat 'node -v'
          bat 'npm ci'
          bat 'npm run build || echo no build step'
        }
      }
    }

    // 2) Test
    stage('Test') {
      steps {
        bat 'npm test'
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // 3) Code Quality (Sonar) — analysis only (no “quality gate” stage)
    stage('Code Quality (Sonar)') {
      environment {
        // scope SONAR_TOKEN into this stage for safety
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner ^
              -Dsonar.projectKey=hd-app ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/build-wrapper-dump.json ^
              -Dsonar.tests=_tests_ ^
              -Dsonar.test.inclusions=_tests_/**/*.js ^
              -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
          '''
        }
      }
    }

    // 4) Security — Dependencies/Filesystem (blocking)
    stage('Security (Trivy FS)') {
      steps {
        // Dockerized Trivy, fails on HIGH/CRITICAL in your repo/deps
        bat """
          docker run --rm ^
            -v "%CD%:/repo" ^
            aquasec/trivy:latest fs --no-progress --scanners vuln ^
            --severity HIGH,CRITICAL --exit-code 1 /repo
        """
      }
    }

    // 5) Docker Build & Push
    stage('Docker Build & Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDS}",
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
          bat """
            docker version
            docker build -t %DOCKER_USER%/hd-app:${IMAGE_TAG} .
            echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin
            docker push %DOCKER_USER%/hd-app:${IMAGE_TAG}
            docker tag  %DOCKER_USER%/hd-app:${IMAGE_TAG} %DOCKER_USER%/hd-app:latest
            docker push %DOCKER_USER%/hd-app:latest
          """
        }
      }
    }

    // 6) Security — Image (non-blocking; archives report for your write-up)
    stage('Security (Trivy Image, Non-blocking)') {
      steps {
        script {
          bat """
            docker run --rm aquasec/trivy:latest image ^
              --no-progress --format json --ignore-unfixed ^
              --severity HIGH,CRITICAL --output trivy-image-${IMAGE_TAG}.json ^
              ${IMAGE_NAME}:${IMAGE_TAG} || ver>NUL
          """
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-image-*.json', allowEmptyArchive: true
        }
      }
    }

    // 7) Deploy — Staging via docker-compose (uses your docker-compose.yml)
    stage('Deploy (Staging)') {
      steps {
        script {
          writeFile file: '.env.staging', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=rootpass
ME_USER=admin
ME_PASS=adminpass
"""
          // Prefer docker compose if available, else docker-compose
          def composeCmd = (bat(script: 'docker compose version', returnStatus: true) == 0) ? 'docker compose' : 'docker-compose'
          bat """
            ${composeCmd} --env-file .env.staging pull
            ${composeCmd} --env-file .env.staging up -d
            timeout /t 8 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // 8) Release — manual promotion gate
    stage('Release: Approve Promotion') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    // 9) Deploy — Production
    stage('Deploy (Production)') {
      steps {
        script {
          writeFile file: '.env.prod', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=rootpass
ME_USER=admin
ME_PASS=adminpass
"""
          def composeCmd = (bat(script: 'docker compose version', returnStatus: true) == 0) ? 'docker compose' : 'docker-compose'
          bat """
            ${composeCmd} --env-file .env.prod pull
            ${composeCmd} --env-file .env.prod up -d
            timeout /t 8 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // 10) Monitoring — simple smoke against prod health
    stage('Monitoring (Smoke)') {
      steps {
        bat """powershell -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """
      }
    }

    // Archive useful config at the end
    stage('Archive & Artifacts') {
      steps {
        archiveArtifacts artifacts: 'Dockerfile,docker-compose*.yml,sonar-project.properties,.env.*', allowEmptyArchive: true
      }
    }
  }

  post {
    success { echo "✅ Pipeline SUCCESS." }
    failure { echo "❌ Pipeline FAILED." }
  }
}
