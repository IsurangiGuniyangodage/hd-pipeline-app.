pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'

    // ---- SonarQube / SonarCloud ----
    SONAR_SERVER = "sonarqube"
    SONAR_TOKEN  = credentials('sonar-token')

    // ---- Health check URLs ----
    APP_HEALTH_URL_STAGING = "http://localhost:9090/health"
    APP_HEALTH_URL_PROD    = "http://localhost:9090/health"
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {

    // 0) Checkout
    stage('Checkout') {
      steps { checkout scm }
    }

    // 1) Build
    stage('Build') {
      steps {
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
        script { bat 'npm test' }
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // 3) Code Quality (Sonar)
    stage('Code Quality (Sonar)') {
      environment { SONAR_TOKEN = credentials('sonar-token') }
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner ^
              -Dsonar.projectKey=hd-app ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/** ^
              -Dsonar.tests=_tests_ ^
              -Dsonar.test.inclusions=_tests_/**/*.js ^
              -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
          '''
        }
      }
    }

    // 3b) Quality Gate — DO NOT FAIL ON NONE
    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          script {
            def qg = waitForQualityGate()   // polls Sonar; works without webhooks
            echo "Quality Gate status: ${qg.status}"
            if (qg.status in ['ERROR','FAILED']) {
              error "Pipeline aborted due to quality gate failure: ${qg.status}"
            }
            // OK, WARN, NONE -> continue (per your earlier working logic)
          }
        }
      }
    }

    // 4) Security Scan (Trivy FS) - Dockerized (no local install)
    stage('Security Scan (Trivy FS)') {
      steps {
        script {
          bat """
            docker run --rm ^
              -v "%cd%:/repo" ^
              aquasec/trivy:latest fs --no-progress --severity HIGH,CRITICAL --exit-code 1 /repo
          """
        }
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

    // 6) Security Scan (Trivy Image)
    stage('Security Scan (Trivy Image)') {
      steps {
        bat """
          docker run --rm aquasec/trivy:latest image --no-progress --severity HIGH,CRITICAL --exit-code 1 ${IMAGE_NAME}:${IMAGE_TAG}
        """
      }
    }

    // 7) Deploy to Staging
    stage('Deploy to Staging') {
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
          def composeCmd = (bat(script: 'docker compose version', returnStatus: true) == 0) ? 'docker compose' : 'docker-compose'
          bat """
            ${composeCmd} --env-file .env.staging pull
            ${composeCmd} --env-file .env.staging up -d
            timeout /t 10 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // 8) Manual approval before Production
    stage('Approval: Promote to Production') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    // 9) Deploy to Production
    stage('Deploy to Production') {
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
            timeout /t 10 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // 10) Monitoring (Smoke)
    stage('Monitoring (Smoke)') {
      steps {
        bat """powershell -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """
      }
    }

    // 11) Archive
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
