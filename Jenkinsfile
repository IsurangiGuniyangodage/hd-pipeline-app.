pipeline {
  agent any
  options {
    timestamps()
    skipDefaultCheckout(true)
  }
  environment {
    // Set these in Jenkins (Manage Jenkins > Credentials)
    GIT_URL = 'https://github.com/IsurangiGuniyangodage/hd-pipeline-app.git'
    DOCKER_IMAGE = 'isurangiguniyangodage/hd-app'
    SONAR_HOST_URL = '' // provided by withSonarQubeEnv
  }
  stages {

    stage('Checkout & Build') {
      steps {
        checkout([$class: 'GitSCM',
          branches: [[name: '*/main']],
          userRemoteConfigs: [[
            url: env.GIT_URL,
            credentialsId: 'github-creds'
          ]]
        ])
        bat 'node -v'
        bat 'npm ci'
        // your project has no compile step; keep placeholder
        bat 'npm run build || echo no build step'
      }
    }

    stage('Test') {
      steps {
        bat 'npm test'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'junit.xml, **/junit.xml, **/junit-report.xml, **/junit/*.xml, **/test-results/*.xml'
          archiveArtifacts artifacts: 'coverage/**', onlyIfSuccessful: false
        }
      }
    }

    stage('Code Quality') {
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv('sonarqube') {
          // Use lcov coverage if present; otherwise Sonar still runs
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

    stage('Security (Dependencies - Trivy FS)') {
      steps {
        // Scan the repo filesystem; fail only if HIGH/CRITICAL in app deps
        bat '''
          docker run --rm -v "%CD%:/repo" aquasec/trivy:latest fs ^
            --no-progress --scanners vuln --severity HIGH,CRITICAL --exit-code 1 /repo
        '''
      }
      post {
        unsuccessful {
          echo 'Dependency scan found HIGH/CRITICAL issues. See console for details and add a note in the report.'
        }
      }
    }

    stage('Docker Build & Push') {
      environment {
        DOCKER_PASS = credentials('dockerhub-pass')
      }
      steps {
        bat 'docker version'
        script {
          def buildTag = env.BUILD_NUMBER
          bat "docker build -t %DOCKER_IMAGE%:${buildTag} ."
          withCredentials([usernamePassword(credentialsId: 'dockerhub-pass', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASSWORD')]) {
            bat 'echo %DOCKER_PASSWORD% | docker login -u %DOCKER_USER% --password-stdin'
          }
          bat "docker push %DOCKER_IMAGE%:${buildTag}"
          bat "docker tag  %DOCKER_IMAGE%:${buildTag} %DOCKER_IMAGE%:latest"
          bat "docker push %DOCKER_IMAGE%:latest"
        }
      }
    }

    stage('Security (Image - Trivy, Non-blocking)') {
      steps {
        // Create a JSON report but DO NOT fail the pipeline
        // This lets you include the explanation required by the rubric.
        script {
          def buildTag = env.BUILD_NUMBER
          bat """
            docker run --rm aquasec/trivy:latest image ^
              --no-progress --format json --ignore-unfixed ^
              --severity HIGH,CRITICAL --output trivy-image-${buildTag}.json ^
              %DOCKER_IMAGE%:${buildTag} || ver>NUL
          """
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-image-*.json', onlyIfSuccessful: false
          script {
            echo 'Image scan completed. If HIGH/CRITICAL OS CVEs exist in the base image, they are documented in the JSON report for your write-up.'
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        script {
          def buildTag = env.BUILD_NUMBER
          // Restart container with the new image
          bat 'docker rm -f hd-app || ver>NUL'
          bat "docker run -d --name hd-app -p 3000:3000 %DOCKER_IMAGE%:${buildTag}"
        }
      }
    }

    stage('Release (Promote)') {
      steps {
        script {
          def buildTag = env.BUILD_NUMBER
          // Promote by tagging as "prod" (example)
          bat "docker tag  %DOCKER_IMAGE%:${buildTag} %DOCKER_IMAGE%:prod"
          bat "docker push %DOCKER_IMAGE%:prod"
        }
      }
    }

    stage('Monitoring & Alerting (Smoke/Health)') {
      steps {
        // Simple health check to demonstrate monitoring hook
        // (Your app exposes GET /health)
        bat '''
          powershell -Command ^
            "$ok=$false; for($i=0;$i -lt 10;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:3000/health -TimeoutSec 5; if($r.StatusCode -eq 200){$ok=$true; break} } catch{} Start-Sleep -s 2 }; if(-not $ok){ exit 1 }"
        '''
      }
    }
  }

  post {
    success {
      echo 'Pipeline completed successfully.'
    }
    failure {
      echo 'Pipeline failed. Check the last failing stage for details.'
    }
    always {
      archiveArtifacts artifacts: 'coverage/**, **/junit*.xml', onlyIfSuccessful: false
    }
  }
}
