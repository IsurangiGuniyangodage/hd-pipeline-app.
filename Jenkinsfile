pipeline {
  agent any

  environment {
    // ---- Image & Registry ----
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'

    // ---- SonarQube ----
    SONAR_SERVER = "sonarqube"                  // Jenkins → Configure System → SonarQube servers (name)
    SONAR_TOKEN  = credentials('sonar-token')   // Secret Text credential id

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

    // 3) Code Quality (Sonar) -> uses _tests_
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

    stage('Quality Gate') {
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          script {
            // Will throw & fail stage automatically if gate is red
            def qg = waitForQualityGate abortPipeline: true, credentialsId: 'sonar-token'
            echo "Quality Gate status: ${qg.status}"
          }
        }
      }
    }

    // 4) Security Scan (Trivy FS) - DOCKERIZED (no local trivy needed)
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

    // 6) Security Scan (Trivy Image) - DOCKERIZED
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

    // Helper to resolve compose command on Windows agents
    stage('Resolve Compose') {
      steps {
        script {
          // Prefer Docker CLI v2 plugin `docker compose`, fallback to legacy `docker-compose`
          def composeCmd = 'docker compose'
          def rc = bat(script: 'docker compose version', returnStatus: true)
          if (rc != 0) {
            rc = bat(script: 'docker-compose --version', returnStatus: true)
            if (rc == 0) {
              composeCmd = 'docker-compose'
            } else {
              // None found; set marker env to skip deploy stages gracefully
              env.NO_COMPOSE = 'true'
            }
          }
          env.COMPOSE_CMD = composeCmd
          echo "Compose command resolved to: ${env.NO_COMPOSE == 'true' ? 'NONE' : env.COMPOSE_CMD}"
        }
      }
    }

    // 7) Deploy to Staging (non-fatal if compose missing)
    stage('Deploy to Staging') {
      when { expression { return env.NO_COMPOSE != 'true' } }
      steps {
        script {
          writeFile file: '.env.staging', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            if exist docker-compose.staging.yml (
              type .env.staging
              ${env.COMPOSE_CMD} --env-file .env.staging -f docker-compose.staging.yml pull
              ${env.COMPOSE_CMD} --env-file .env.staging -f docker-compose.staging.yml up -d
            ) else (
              echo docker-compose.staging.yml not found. Using docker-compose.yml
              ${env.COMPOSE_CMD} --env-file .env.staging pull
              ${env.COMPOSE_CMD} --env-file .env.staging up -d
            )
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // If compose is missing, mark stage unstable but do not fail the build
    stage('Deploy to Staging (Skipped)') {
      when { expression { return env.NO_COMPOSE == 'true' } }
      steps {
        script {
          currentBuild.result = 'UNSTABLE'
          echo 'docker compose / docker-compose not found on agent. Skipping deploy to Staging (build will continue).'
        }
      }
    }

    // 8) Manual approval
    stage('Approval: Promote to Production') {
      when { expression { return env.NO_COMPOSE != 'true' } }
      steps {
        timeout(time: 15, unit: 'MINUTES') {
          input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
        }
      }
    }

    // 9) Deploy to Production (non-fatal if compose missing)
    stage('Deploy to Production') {
      when { expression { return env.NO_COMPOSE != 'true' } }
      steps {
        script {
          writeFile file: '.env.prod', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            if exist docker-compose.prod.yml (
              type .env.prod
              ${env.COMPOSE_CMD} --env-file .env.prod -f docker-compose.prod.yml pull
              ${env.COMPOSE_CMD} --env-file .env.prod -f docker-compose.prod.yml up -d
            ) else (
              echo docker-compose.prod.yml not found. Using docker-compose.yml
              ${env.COMPOSE_CMD} --env-file .env.prod pull
              ${env.COMPOSE_CMD} --env-file .env.prod up -d
            )
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // 10) Monitoring & optional Slack notify (never fails the build)
    stage('Monitoring & Alerting') {
      steps {
        script {
          if (env.NO_COMPOSE != 'true') {
            bat """powershell -Command "1..3 | %%{ try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' } }" """
          }
          try {
            withCredentials([string(credentialsId: 'slack-webhook', variable: 'SLACK_WEBHOOK')]) {
              bat """
                powershell -Command "$b=@{text='✅ Pipeline OK. Image ${IMAGE_NAME}:${IMAGE_TAG} built & scanned.'} | ConvertTo-Json | Invoke-WebRequest -UseBasicParsing -Method Post -Uri '$env:SLACK_WEBHOOK' -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $b)))"
              """
            }
          } catch (e) {
            echo 'Slack webhook not configured - skipping notification.'
          }
        }
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
    success { echo "Pipeline SUCCESS." }
    unstable { echo "Pipeline marked UNSTABLE (deploy skipped or health warn) but not failed." }
    failure { echo "Pipeline FAILED." }
  }
}
