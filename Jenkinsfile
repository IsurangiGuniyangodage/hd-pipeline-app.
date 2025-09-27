pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'

    // ---- SonarQube (Code Quality) ----
    SONAR_SERVER = "sonarqube"                 // Manage Jenkins -> System -> SonarQube servers (name)
    SONAR_TOKEN  = credentials('sonar-token')  // Secret Text credential id

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
    // 1) Build (artefact = Docker image later)
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
          // Adjust if your jest-junit writes to a different path
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // 3) Code Quality (Sonar) — analysis only (no gate wait)
    stage('Code Quality (Sonar)') {
      environment { SONAR_TOKEN = credentials('sonar-token') }
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

    // 4) Security scan (filesystem/deps)
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

    // 5) Docker Build & Push (THIS WAS MISSING)
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

    // 6) Security scan (image)
    stage('Security Scan (Trivy Image)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDS}",
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
          bat """
            docker run --rm aquasec/trivy:latest image --no-progress --severity HIGH,CRITICAL --exit-code 1 %DOCKER_USER%/hd-app:${IMAGE_TAG}
          """
        }
      }
    }

    // 7) Deploy (Staging via docker-compose)
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
          bat """
            docker-compose --env-file .env.staging up -d
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
            if %errorlevel% neq 0 ( echo Staging health check FAILED & exit /b 1 ) else ( echo Staging health OK )
          """
        }
      }
    }

    // 8) Release approval
    stage('Approval: Promote to Production') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    // 9) Deploy (Production)
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
          bat """
            docker-compose --env-file .env.prod up -d
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
            if %errorlevel% neq 0 ( echo Production health check FAILED & exit /b 1 ) else ( echo Production health OK )
          """
        }
      }
    }

    // 10) Monitoring (simple smoke + optional Slack)
    stage('Monitoring (Smoke)') {
      steps {
        script {
          bat """powershell -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """
          // Slack is optional; won’t fail if not configured
          try {
            withCredentials([string(credentialsId: 'slack-webhook', variable: 'SLACK_WEBHOOK')]) {
              bat """
                powershell -Command "$b=@{text='✅ Deployed ${IMAGE_NAME}:${IMAGE_TAG}. Health OK.'} | ConvertTo-Json | Invoke-WebRequest -UseBasicParsing -Method Post -Uri '$env:SLACK_WEBHOOK' -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $b)))"
              """
            }
          } catch (e) {
            echo 'Slack webhook not configured - skipping notification.'
          }
        }
      }
    }

    // Archive key files
    stage('Archive & Artifacts') {
      steps {
        archiveArtifacts artifacts: 'Dockerfile,docker-compose*.yml,sonar-project.properties,.env.*', allowEmptyArchive: true
      }
    }
  }

  post {
    success { echo "Pipeline SUCCESS." }
    failure { echo "Pipeline FAILED." }
  }
}
